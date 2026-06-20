/**
 * Pharmacy operating hours resolver.
 *
 * Med-Tracker promises users a "refill ready by X" experience that
 * accounts for whether the chosen pharmacy is actually open. The naive
 * approach (always show the chosen pharmacy as open) misses three real
 * conditions:
 *
 *   1. Regular weekly hours (different hours per day; closed on Sundays).
 *   2. Holiday overrides (Christmas closed entirely, Thanksgiving short).
 *   3. 24-hour pharmacies (always open, no need to check).
 *
 * resolvePharmacyOpen takes the schedule and answers, for a given UTC
 * instant aligned to the pharmacy's local timezone offset:
 *
 *   - isOpen: bool.
 *   - nextOpen: ISO ts of the next opening (omitted if currently open and
 *     no holiday closure pending today).
 *   - nextClose: ISO ts of the next closing (only when currently open).
 *
 * All math is timezone-naive on the caller-supplied "local" instants; the
 * caller is responsible for converting between UTC and pharmacy-local
 * before/after invocation. This matches the rest of the package
 * (quiet-hours, schedule.ts) where timezone is the caller's job.
 */

import { addDays, parseHHMM, startOfDay } from './date';

export interface DayHours {
  /** Opening time HH:MM, inclusive. */
  open: string;
  /** Closing time HH:MM, exclusive. Can be `24:00` for end-of-day. */
  close: string;
}

export interface PharmacyHours {
  /**
   * Regular weekly hours, indexed by ISO day-of-week (0 = Sunday).
   * Missing day = closed.
   */
  weekly?: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, DayHours | DayHours[]>>;
  /**
   * Per-date overrides keyed by YYYY-MM-DD. An empty array or null means
   * closed that day (overrides weekly). Use an entry to extend or shorten.
   */
  overrides?: Record<string, DayHours[] | null>;
  /** When true, pharmacy is always open. weekly/overrides ignored. */
  always?: boolean;
}

export interface OpenQuery {
  hours: PharmacyHours;
  /** Local instant (Date) to evaluate. */
  at: Date;
  /**
   * Upper bound on how many days forward to search for next open/close.
   * Default 30 days, plenty for any realistic pharmacy schedule.
   */
  horizonDays?: number;
}

export interface OpenResult {
  isOpen: boolean;
  /** ISO timestamp of next open boundary, omitted when currently open. */
  nextOpen?: string;
  /** ISO timestamp of next close boundary, present only when currently open. */
  nextClose?: string;
  reason: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === 24 && m === 0) return 24 * 60;
  return (h ?? 0) * 60 + (m ?? 0);
}

function parseHoursForDay(hours: PharmacyHours, day: Date): DayHours[] {
  const iso = day.toISOString().slice(0, 10);
  const override = hours.overrides?.[iso];
  if (override === null) return [];
  if (override !== undefined) return override;
  const dow = day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const w = hours.weekly?.[dow];
  if (!w) return [];
  return Array.isArray(w) ? w : [w];
}

function instantOnDay(day: Date, hhmm: string): Date {
  if (hhmm === '24:00') {
    return addDays(startOfDay(day), 1);
  }
  return parseHHMM(hhmm, day);
}

function intervalsForDay(hours: PharmacyHours, day: Date): { start: Date; end: Date }[] {
  const spans = parseHoursForDay(hours, day);
  return spans
    .filter((s) => toMinutes(s.close) > toMinutes(s.open))
    .map((s) => ({ start: instantOnDay(day, s.open), end: instantOnDay(day, s.close) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function resolvePharmacyOpen(q: OpenQuery): OpenResult {
  if (q.hours.always) {
    return { isOpen: true, reason: '24-hour pharmacy.' };
  }
  const horizon = q.horizonDays ?? 30;
  const at = q.at;

  // Is `at` inside any of today's intervals?
  const today = startOfDay(at);
  const todays = intervalsForDay(q.hours, today);
  for (const span of todays) {
    if (at.getTime() >= span.start.getTime() && at.getTime() < span.end.getTime()) {
      return {
        isOpen: true,
        nextClose: span.end.toISOString(),
        reason: `Open until ${span.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
      };
    }
  }

  // Not open right now: find the next opening within horizon.
  // Start with today's remaining intervals.
  for (const span of todays) {
    if (span.start.getTime() > at.getTime()) {
      return {
        isOpen: false,
        nextOpen: span.start.toISOString(),
        reason: `Closed; opens at ${span.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
      };
    }
  }
  for (let d = 1; d <= horizon; d++) {
    const day = addDays(today, d);
    const spans = intervalsForDay(q.hours, day);
    if (spans.length > 0) {
      const next = spans[0]!.start;
      return {
        isOpen: false,
        nextOpen: next.toISOString(),
        reason: `Closed; next open ${next.toISOString()}.`,
      };
    }
  }
  return {
    isOpen: false,
    reason: `Closed; no opening found within ${horizon} days.`,
  };
}

/**
 * Convenience: given a list of pharmacies, return the subset open at `at`
 * sorted by their nextClose ascending so the UI can recommend "stops
 * closing first" first.
 */
export function pharmaciesOpenNow<T extends { hours: PharmacyHours }>(
  list: T[],
  at: Date,
): Array<T & { closesAt: string }> {
  const open: Array<T & { closesAt: string }> = [];
  for (const p of list) {
    const r = resolvePharmacyOpen({ hours: p.hours, at });
    if (r.isOpen) {
      open.push({ ...p, closesAt: r.nextClose ?? '' });
    }
  }
  open.sort((a, b) => a.closesAt.localeCompare(b.closesAt));
  return open;
}
