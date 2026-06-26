/**
 * upcoming-doses — pure forward projection of doses grouped by relative day.
 *
 * The /upcoming page currently shows only today's pending doses. This module
 * expands the user's weekly schedules across an N-day horizon (composing the
 * same dosesForDay expander the month view uses) and groups the result under
 * relative day headers (Today / Tomorrow / weekday / short date). On the TODAY
 * group it drops dose times that have already passed, so "upcoming" always
 * means "still to come".
 *
 * All date math is LOCAL (no UTC drift) and every entry point takes an injected
 * `now`, so the projection is fully deterministic under test.
 */

import { dosesForDay, type DayScheduleLike, type DayDose } from './day-doses';

export interface UpcomingDose extends DayDose {
  /** YYYY-MM-DD local day this dose lands on. */
  dayKey: string;
  /** Minutes from `now` until this dose (>= 0 for the forward view). */
  minutesUntil: number;
}

export interface UpcomingDayGroup {
  /** Local day key, YYYY-MM-DD. */
  key: string;
  /** "Today" / "Tomorrow" / "Wed" / "Jul 3". */
  label: string;
  /** 0 = today, 1 = tomorrow, ... */
  daysAhead: number;
  doses: UpcomingDose[];
}

export interface UpcomingSummary {
  groups: UpcomingDayGroup[];
  /** Total doses across all groups. */
  total: number;
  /** The soonest upcoming dose, or null when none. */
  next: UpcomingDose | null;
  /** Number of days that carry at least one dose. */
  activeDays: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local YYYY-MM-DD key for a Date. */
function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Relative day label for a day-key that is `daysAhead` from today. */
export function upcomingDayLabel(dayKey: string, daysAhead: number): string {
  if (daysAhead === 0) return 'Today';
  if (daysAhead === 1) return 'Tomorrow';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dayKey);
  if (daysAhead >= 2 && daysAhead <= 6) return WEEKDAYS[d.getDay()]!;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Absolute clock-time (ms) of a dose at `time` on the given local day. */
function doseInstant(dayKey: string, minutesOfDay: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey);
  if (!m) return NaN;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
  return d.getTime();
}

/**
 * Project the schedules forward `horizonDays` days (default 7, capped 1..31)
 * and group the resulting doses by relative day. The TODAY group only keeps
 * doses whose time is still in the future relative to `now`. Empty days are
 * omitted. Groups come back soonest-day first; doses inside a day stay
 * time-sorted (as dosesForDay returns them).
 */
export function projectUpcoming(
  recurrences: readonly DayScheduleLike[],
  now: number = Date.now(),
  horizonDays = 7,
): UpcomingSummary {
  const horizon = Math.max(1, Math.min(31, Math.round(horizonDays)));
  const base = new Date(now);
  const groups: UpcomingDayGroup[] = [];
  let total = 0;
  let next: UpcomingDose | null = null;

  for (let offset = 0; offset < horizon; offset++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const key = dayKeyOf(day);
    const expansion = dosesForDay(key, recurrences);
    if (expansion.total === 0) continue;

    const doses: UpcomingDose[] = [];
    for (const d of expansion.doses) {
      const instant = doseInstant(key, d.minutes);
      const minutesUntil = Math.round((instant - now) / 60_000);
      // On today, drop doses that have already passed.
      if (offset === 0 && minutesUntil < 0) continue;
      const dose: UpcomingDose = { ...d, dayKey: key, minutesUntil };
      doses.push(dose);
      if (next === null || minutesUntil < next.minutesUntil) next = dose;
    }

    if (doses.length === 0) continue;
    groups.push({ key, label: upcomingDayLabel(key, offset), daysAhead: offset, doses });
    total += doses.length;
  }

  return { groups, total, next, activeDays: groups.length };
}

/**
 * Humanise minutes-until into a short relative phrase: "now", "in 25m",
 * "in 3h", "in 3h 10m", "tomorrow". For day-level headers the label already
 * carries the day, so this is for the per-dose chip.
 */
export function formatUntil(minutesUntil: number): string {
  if (!Number.isFinite(minutesUntil)) return '';
  if (minutesUntil <= 0) return 'now';
  if (minutesUntil < 60) return `in ${minutesUntil}m`;
  const h = Math.floor(minutesUntil / 60);
  const m = minutesUntil % 60;
  if (h < 24) return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
  const days = Math.round(h / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}
