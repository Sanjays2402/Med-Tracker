/**
 * month-grid — pure calendar-grid math for the schedule month view.
 *
 * Builds the canonical 6-row x 7-col month grid (always 42 cells) anchored on
 * the first of the month, with leading/trailing days from the adjacent months
 * so every week row is full. Also expands a set of weekly ScheduleEntry-like
 * recurrences into per-day dose counts so the calendar can show how many doses
 * land on each day.
 *
 * All date handling is done in LOCAL time using y/m/d integer keys so there is
 * no UTC drift: a dose scheduled "every Monday" lands on the local Monday cell.
 */

export interface MonthCell {
  /** Local calendar date for this cell. */
  date: Date;
  /** YYYY-MM-DD key (local). */
  key: string;
  day: number; // 1..31
  /** 0..6, Sun..Sat */
  weekday: number;
  /** True when the cell belongs to the displayed month (not a spill day). */
  inMonth: boolean;
  /** True when the cell is "today" relative to the provided `today`. */
  isToday: boolean;
}

export interface MonthGrid {
  year: number;
  month: number; // 0..11
  /** 42 cells, row-major (6 weeks x 7 days), week starting Sunday. */
  cells: MonthCell[];
  /** Month label, e.g. "June 2026". */
  label: string;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Build the 6x7 grid for the given year/month (month is 0-based). */
export function buildMonthGrid(year: number, month: number, today: Date = new Date()): MonthGrid {
  const first = new Date(year, month, 1);
  // Sunday-anchored: back up to the Sunday on or before the 1st.
  const start = new Date(year, month, 1 - first.getDay());

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date: d,
      key: ymd(d),
      day: d.getDate(),
      weekday: d.getDay(),
      inMonth: d.getMonth() === month,
      isToday: sameDay(d, today),
    });
  }

  return { year, month, cells, label: `${MONTH_NAMES[month]} ${year}` };
}

/** Step to the previous month, normalising year rollover. */
export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/** Step to the next month, normalising year rollover. */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

export interface RecurrenceLike {
  /** Number of dose times per active day. */
  times: string[];
  /** 0..6 Sun..Sat; undefined/empty means every day. */
  daysOfWeek?: number[];
  /** ISO date; recurrence does not produce doses after this day (inclusive). */
  endDate?: string;
  /** ISO date; recurrence does not produce doses before this day (inclusive). */
  startDate?: string;
}

/**
 * Count how many doses each cell receives from the given recurrences. Returns a
 * map of YYYY-MM-DD -> total dose count. A day with no doses is simply absent.
 */
export function doseCountsForGrid(
  grid: MonthGrid,
  recurrences: readonly RecurrenceLike[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cell of grid.cells) {
    let total = 0;
    for (const rec of recurrences) {
      const active =
        (!rec.daysOfWeek || rec.daysOfWeek.length === 0 || rec.daysOfWeek.includes(cell.weekday)) &&
        withinRange(cell.key, rec.startDate, rec.endDate);
      if (active) total += rec.times.length;
    }
    if (total > 0) counts[cell.key] = total;
  }
  return counts;
}

function withinRange(dayKey: string, startISO?: string, endISO?: string): boolean {
  // Treat start/end as calendar days via the ISO date portion (first 10 chars).
  // This is timezone-stable: it never drifts a day based on the host's offset,
  // and compares cleanly (lexicographically) against the local YYYY-MM-DD key.
  if (startISO && dayKey < isoDay(startISO)) return false;
  if (endISO && dayKey > isoDay(endISO)) return false;
  return true;
}

function isoDay(iso: string): string {
  // Fast path for well-formed ISO strings (YYYY-MM-DD...).
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  return ymd(new Date(iso));
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
