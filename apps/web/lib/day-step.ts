/**
 * day-step — pure YYYY-MM-DD day arithmetic for the day-drilldown panel.
 *
 * The schedule day-drilldown panel gets prev/next day arrows (and left/right
 * arrow keys) so a user can walk from day to day without closing the panel.
 * This module owns the date-key stepping: add/subtract whole days with correct
 * month and year rollover (including leap years), plus the relative-label and
 * "is today" helpers the panel header needs.
 *
 * All math is done on the integer y/m/d components in LOCAL time (never a UTC
 * conversion) so it composes with day-doses / month-grid, which key the same
 * way. No React, no implicit Date.now() — `today` is always injectable.
 */

export interface YMD {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

/** Parse a YYYY-MM-DD (optionally with a trailing time) into y/m/d, or null. */
export function parseDayKey(dayKey: string): YMD | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a y/m/d back into a canonical YYYY-MM-DD key. */
export function formatDayKey({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Step a day key by `delta` whole days, with full month/year/leap rollover.
 * Returns a canonical YYYY-MM-DD string. An unparseable key is returned
 * unchanged so the caller never produces an "Invalid Date" key.
 */
export function stepDay(dayKey: string, delta: number): string {
  const p = parseDayKey(dayKey);
  if (!p) return dayKey;
  // Local Date does the heavy lifting of rollover (incl. leap years / DST-safe
  // because we only touch the date component, never the wall clock).
  const dt = new Date(p.y, p.m - 1, p.d + Math.trunc(delta));
  return formatDayKey({ y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() });
}

/** The day after `dayKey`. */
export function nextDay(dayKey: string): string {
  return stepDay(dayKey, 1);
}

/** The day before `dayKey`. */
export function prevDay(dayKey: string): string {
  return stepDay(dayKey, -1);
}

/** Whole days from `a` to `b` (b - a); positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const pa = parseDayKey(a);
  const pb = parseDayKey(b);
  if (!pa || !pb) return 0;
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ub - ua) / 86_400_000);
}

/** True when the two keys refer to the same calendar day. */
export function isSameDay(a: string, b: string): boolean {
  const pa = parseDayKey(a);
  const pb = parseDayKey(b);
  if (!pa || !pb) return a.slice(0, 10) === b.slice(0, 10);
  return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
}

/** The YYYY-MM-DD key for a Date in local time (defaults to now). */
export function todayKey(now: Date = new Date()): string {
  return formatDayKey({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

/**
 * Short relative label for `dayKey` against `today`: "Today", "Tomorrow",
 * "Yesterday", "In N days", or "N days ago". Used for the panel's subhead so a
 * user walking days always knows where they are relative to now.
 */
export function relativeDayLabel(dayKey: string, today: string = todayKey()): string {
  const diff = daysBetween(today, dayKey);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export interface DayStepView {
  dayKey: string;
  prevKey: string;
  nextKey: string;
  /** True when dayKey is the same calendar day as `today`. */
  isToday: boolean;
  /** Relative label vs today, e.g. "Yesterday". */
  relativeLabel: string;
}

/**
 * Bundle the prev/next neighbours plus today-relative metadata for `dayKey`.
 * One call gives the panel everything it needs to render its stepper header.
 */
export function dayStepView(dayKey: string, today: string = todayKey()): DayStepView {
  return {
    dayKey,
    prevKey: prevDay(dayKey),
    nextKey: nextDay(dayKey),
    isToday: isSameDay(dayKey, today),
    relativeLabel: relativeDayLabel(dayKey, today),
  };
}
