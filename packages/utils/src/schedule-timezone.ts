import type { Schedule } from '@med/types';

/**
 * Timezone-aware dose-time expansion.
 *
 * The default `expandSchedule` in this package works in the host's local
 * timezone, which is fine for tests but wrong in production: a server in
 * UTC would shift every "08:00" dose by hours and a DST transition in the
 * patient's region would cause one or two doses per year to fire at the
 * wrong wall-clock time.
 *
 * This module expands schedules in a specified IANA timezone (for example
 * `America/Los_Angeles`) by computing, for each calendar day in the
 * window, the UTC instant whose wall clock in that zone is the requested
 * HH:MM. The math handles DST gaps and overlaps by using the Intl
 * formatter to invert "what UTC moment yields this wall time in the zone"
 * with a one-step correction, which is both reasonably fast and correct
 * to the minute for every modern zone.
 */

export interface TimezoneExpandOptions {
  /** IANA zone, for example "America/Los_Angeles" or "Europe/Berlin". */
  timeZone: string;
  /** Inclusive start of the expansion window (UTC instant). */
  from: Date;
  /** Inclusive end of the expansion window (UTC instant). */
  to: Date;
}

export function expandScheduleInZone(schedule: Schedule, opts: TimezoneExpandOptions): Date[] {
  if (schedule.kind === 'asNeeded' || !schedule.enabled) return [];
  if (schedule.kind === 'cron') return []; // cron expressions are not handled here

  const out: Date[] = [];
  const firstDay = zonedYMD(opts.from, opts.timeZone);
  const lastDay = zonedYMD(opts.to, opts.timeZone);
  let cursor = { ...firstDay };
  // Hard safety bound: a 5-year window is plenty for any reasonable export.
  let guard = 0;
  while (compareYMD(cursor, lastDay) <= 0 && guard < 5 * 366) {
    guard += 1;
    const weekday = weekdayInZone(cursor, opts.timeZone);
    if (schedule.kind === 'daily') {
      for (const t of schedule.times) pushIfInWindow(out, dateFor(cursor, t, opts.timeZone), opts);
    } else if (schedule.kind === 'weekly' && schedule.daysOfWeek?.includes(weekday)) {
      for (const t of schedule.times) pushIfInWindow(out, dateFor(cursor, t, opts.timeZone), opts);
    } else if (schedule.kind === 'interval' && schedule.intervalHours) {
      // Anchor interval doses at midnight local time and step forward through the day.
      const start = dateFor(cursor, '00:00', opts.timeZone);
      const nextDay = dateFor(addYMD(cursor, 1), '00:00', opts.timeZone);
      let t = start.getTime();
      const stepMs = schedule.intervalHours * 3_600_000;
      while (t < nextDay.getTime()) {
        pushIfInWindow(out, new Date(t), opts);
        t += stepMs;
      }
    }
    cursor = addYMD(cursor, 1);
  }
  out.sort((a, b) => a.getTime() - b.getTime());
  return out;
}

function pushIfInWindow(out: Date[], d: Date, opts: TimezoneExpandOptions): void {
  if (d.getTime() >= opts.from.getTime() && d.getTime() <= opts.to.getTime()) out.push(d);
}

interface YMD {
  y: number;
  m: number; // 1..12
  d: number; // 1..31
}

function addYMD(ymd: YMD, days: number): YMD {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function compareYMD(a: YMD, b: YMD): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

/**
 * Convert a UTC instant to the year/month/day as it appears in the target zone.
 */
export function zonedYMD(at: Date, timeZone: string): YMD {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

function weekdayInZone(ymd: YMD, timeZone: string): number {
  // Use noon UTC of the date as a stable instant, then ask the zone.
  const probe = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 12));
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const day = fmt.format(probe);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[day] ?? 0;
}

/**
 * Resolve the UTC instant whose wall-clock time in `timeZone` is the given
 * date and HH:MM. DST handling: during the spring-forward gap a wall time
 * that does not exist is resolved to the equivalent instant just before the
 * jump; during the fall-back overlap the earlier of the two instants is
 * returned. Both are reasonable defaults that match Apple Calendar.
 */
export function dateFor(ymd: YMD, hhmm: string, timeZone: string): Date {
  const [hh, mm] = hhmm.split(':').map(Number);
  // First guess: treat the wall components as if they were UTC.
  const guess = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, hh, mm));
  // What wall time does that instant render to in the zone?
  const renderedOffsetMin = utcOffsetMinutes(guess, timeZone);
  // Correct by the difference. UTC instant = wall instant - offset.
  let utc = guess.getTime() - renderedOffsetMin * 60_000;
  // Second pass in case the offset itself depends on the corrected instant
  // (the typical DST boundary case).
  const offset2 = utcOffsetMinutes(new Date(utc), timeZone);
  if (offset2 !== renderedOffsetMin) {
    utc = guess.getTime() - offset2 * 60_000;
  }
  return new Date(utc);
}

/** UTC offset (minutes east of UTC) for an instant in a zone. */
export function utcOffsetMinutes(at: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  // "GMT-7" or "GMT+5:30" or "GMT"
  const m = tz.match(/GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  if (!m[1]) return 0;
  const sign = m[1] === '+' ? 1 : -1;
  const hours = Number(m[2]);
  const mins = m[3] ? Number(m[3]) : 0;
  return sign * (hours * 60 + mins);
}
