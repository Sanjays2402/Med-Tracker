/**
 * week-strip — pure model for the medication-detail "last 7 days" dose strip.
 *
 * Given the per-day dose events for ONE medication over a recent window, collapse
 * each day into a single adherence state so the detail page can render a row of
 * seven pills:
 *   - full    : every scheduled dose that day was taken
 *   - partial : some but not all taken (a mix of taken + skipped/missed)
 *   - missed  : doses were scheduled but none were taken
 *   - none    : nothing was scheduled that day
 *
 * All keying is done with local YYYY-MM-DD strings so there's no UTC drift, and
 * `today` is injected for deterministic tests.
 */

export type DayState = 'full' | 'partial' | 'missed' | 'none';

export interface WeekStripDoseInput {
  /** ISO scheduled time of the dose. */
  scheduledAt: string;
  status: 'pending' | 'taken' | 'skipped' | 'missed';
}

export interface WeekStripDay {
  /** Local YYYY-MM-DD key. */
  key: string;
  /** One-letter weekday (S M T W T F S). */
  weekdayInitial: string;
  /** Day of month 1..31. */
  day: number;
  state: DayState;
  taken: number;
  scheduled: number;
  isToday: boolean;
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Collapse a single day's doses into a DayState + counts. */
export function classifyDay(doses: readonly WeekStripDoseInput[]): { state: DayState; taken: number; scheduled: number } {
  const scheduled = doses.length;
  if (scheduled === 0) return { state: 'none', taken: 0, scheduled: 0 };
  const taken = doses.filter((d) => d.status === 'taken').length;
  if (taken === 0) return { state: 'missed', taken, scheduled };
  if (taken === scheduled) return { state: 'full', taken, scheduled };
  return { state: 'partial', taken, scheduled };
}

/**
 * Build the seven-day strip ending on `today` (today is the rightmost cell).
 * `dosesByDay` maps a local YYYY-MM-DD key to that day's doses for the med.
 */
export function buildWeekStrip(
  dosesByDay: Readonly<Record<string, readonly WeekStripDoseInput[]>>,
  today: number = Date.now(),
  days = 7,
): WeekStripDay[] {
  const out: WeekStripDay[] = [];
  const todayKey = localKey(new Date(today));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localKey(d);
    const dayDoses = dosesByDay[key] ?? [];
    const { state, taken, scheduled } = classifyDay(dayDoses);
    out.push({
      key,
      weekdayInitial: WEEKDAY_INITIALS[d.getDay()]!,
      day: d.getDate(),
      state,
      taken,
      scheduled,
      isToday: key === todayKey,
    });
  }
  return out;
}

export interface WeekStripSummary {
  /** Days with at least one scheduled dose. */
  activeDays: number;
  /** Days where every scheduled dose was taken. */
  perfectDays: number;
  /** Days with scheduled doses but none taken. */
  missedDays: number;
  /** Adherence over the week = takenTotal / scheduledTotal, rounded percent. */
  adherencePct: number;
}

export function summarizeWeekStrip(strip: readonly WeekStripDay[]): WeekStripSummary {
  let takenTotal = 0;
  let scheduledTotal = 0;
  let activeDays = 0;
  let perfectDays = 0;
  let missedDays = 0;
  for (const d of strip) {
    if (d.scheduled > 0) activeDays++;
    if (d.state === 'full') perfectDays++;
    if (d.state === 'missed') missedDays++;
    takenTotal += d.taken;
    scheduledTotal += d.scheduled;
  }
  return {
    activeDays,
    perfectDays,
    missedDays,
    adherencePct: scheduledTotal > 0 ? Math.round((takenTotal / scheduledTotal) * 100) : 0,
  };
}
