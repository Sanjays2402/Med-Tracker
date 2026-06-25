/**
 * day-doses — pure expansion of a single calendar day's doses from schedules.
 *
 * The schedule month view lets a user click any day to drill into exactly what
 * doses land on that day, listed by time. This module takes the same
 * ScheduleEntry-like recurrences the month grid uses and expands ONE day key
 * (YYYY-MM-DD local) into a time-sorted list of dose rows, plus a small summary
 * (total doses, distinct medications, time span).
 *
 * Timezone-stable: the day is matched on its local weekday + the lexicographic
 * YYYY-MM-DD key, never on a UTC conversion, so a dose "every Monday" lands on
 * the local Monday cell exactly like doseCountsForGrid. No React, no Date.now().
 */

export interface DayScheduleLike {
  medicationId: string;
  medicationName: string;
  /** "HH:mm" dose times. */
  times: string[];
  /** 0..6 Sun..Sat; undefined/empty means every day. */
  daysOfWeek?: number[];
  /** ISO date; no doses after this day (inclusive). */
  endDate?: string;
  /** ISO date; no doses before this day (inclusive). */
  startDate?: string;
  /** Optional note carried onto each dose row. */
  notes?: string;
}

export interface DayDose {
  medicationId: string;
  medicationName: string;
  /** "HH:mm" 24h. */
  time: string;
  /** Minutes since midnight, for sorting / part-of-day. */
  minutes: number;
  /** morning < 12:00, afternoon < 17:00, evening otherwise. */
  partOfDay: 'morning' | 'afternoon' | 'evening';
  notes?: string;
}

export interface DayDoseSummary {
  /** YYYY-MM-DD the summary was built for. */
  dayKey: string;
  /** 0..6 weekday of the day. */
  weekday: number;
  doses: DayDose[];
  total: number;
  /** Distinct medications dosed that day. */
  medicationCount: number;
  /** Earliest dose time "HH:mm", or null when empty. */
  firstTime: string | null;
  /** Latest dose time "HH:mm", or null when empty. */
  lastTime: string | null;
}

function parseDayKey(dayKey: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Local weekday (0..6) for a YYYY-MM-DD key. */
export function weekdayOf(dayKey: string): number {
  const p = parseDayKey(dayKey);
  if (!p) return new Date(dayKey).getDay();
  return new Date(p.y, p.m - 1, p.d).getDay();
}

export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return Number.MAX_SAFE_INTEGER; // unparseable times sort last
  const h = Math.min(23, Math.max(0, Number(match[1])));
  const m = Math.min(59, Math.max(0, Number(match[2])));
  return h * 60 + m;
}

export function partOfDay(minutes: number): DayDose['partOfDay'] {
  if (minutes < 12 * 60) return 'morning';
  if (minutes < 17 * 60) return 'afternoon';
  return 'evening';
}

function withinRange(dayKey: string, startISO?: string, endISO?: string): boolean {
  const day = dayKey.slice(0, 10);
  if (startISO && day < startISO.slice(0, 10)) return false;
  if (endISO && day > endISO.slice(0, 10)) return false;
  return true;
}

/**
 * Expand all doses that land on `dayKey` from the given recurrences, sorted by
 * time of day (earliest first); ties break by medication name A-Z. Each dose
 * time on an active recurrence produces one row.
 */
export function dosesForDay(
  dayKey: string,
  recurrences: readonly DayScheduleLike[],
): DayDoseSummary {
  const weekday = weekdayOf(dayKey);
  const doses: DayDose[] = [];

  for (const rec of recurrences) {
    const onThisWeekday =
      !rec.daysOfWeek || rec.daysOfWeek.length === 0 || rec.daysOfWeek.includes(weekday);
    if (!onThisWeekday || !withinRange(dayKey, rec.startDate, rec.endDate)) continue;

    for (const time of rec.times) {
      const minutes = timeToMinutes(time);
      doses.push({
        medicationId: rec.medicationId,
        medicationName: rec.medicationName,
        time,
        minutes,
        partOfDay: partOfDay(minutes),
        ...(rec.notes ? { notes: rec.notes } : {}),
      });
    }
  }

  doses.sort((a, b) =>
    a.minutes - b.minutes ||
    a.medicationName.localeCompare(b.medicationName, undefined, { sensitivity: 'base' }),
  );

  const medicationCount = new Set(doses.map((d) => d.medicationId)).size;

  return {
    dayKey,
    weekday,
    doses,
    total: doses.length,
    medicationCount,
    firstTime: doses.length ? doses[0]!.time : null,
    lastTime: doses.length ? doses[doses.length - 1]!.time : null,
  };
}

/** Group an expanded day's doses by part-of-day, preserving time order. */
export function groupByPartOfDay(doses: readonly DayDose[]): Array<{ part: DayDose['partOfDay']; doses: DayDose[] }> {
  const order: DayDose['partOfDay'][] = ['morning', 'afternoon', 'evening'];
  return order
    .map((part) => ({ part, doses: doses.filter((d) => d.partOfDay === part) }))
    .filter((g) => g.doses.length > 0);
}

export const PART_OF_DAY_LABEL: Record<DayDose['partOfDay'], string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};
