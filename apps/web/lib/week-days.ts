/**
 * week-days — pure helpers for the /schedule/week grid's "today" column.
 *
 * The week grid renders 7 day columns starting on Sunday. This module computes
 * which column is "today" (and whether today even falls inside the rendered
 * week), so the page can highlight that column with a sage spine + "Today" cap
 * and scroll it into view. Pure date math with an injected `now` so the
 * highlight logic is unit-tested rather than smeared across the component.
 */

export interface WeekDayCell {
  /** 0..6 column index within the rendered week (0 = the week's first day). */
  index: number;
  /** The actual date at that column (local midnight). */
  date: Date;
  /** Day-of-month, 1..31. */
  dayOfMonth: number;
  /** Day-of-week, 0 (Sun) .. 6 (Sat). */
  weekday: number;
  /** True when this column is today (only one column can be). */
  isToday: boolean;
}

export interface WeekModel {
  start: Date;
  cells: WeekDayCell[];
  /** Column index of today, or -1 when today is outside the rendered week. */
  todayIndex: number;
  /** True when today falls within the rendered week. */
  containsToday: boolean;
}

/** Local midnight of the Sunday that begins the week containing `ms`. */
export function startOfWeek(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** True when two timestamps land on the same local calendar day. */
export function isSameLocalDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Build the 7-cell week model for a week starting at `weekStart`, marking which
 * column (if any) is today relative to `now`.
 */
export function buildWeekModel(
  weekStart: Date,
  now: number = Date.now(),
): WeekModel {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);

  const cells: WeekDayCell[] = [];
  let todayIndex = -1;
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const isToday = isSameLocalDay(date.getTime(), now);
    if (isToday) todayIndex = i;
    cells.push({
      index: i,
      date,
      dayOfMonth: date.getDate(),
      weekday: date.getDay(),
      isToday,
    });
  }

  return {
    start,
    cells,
    todayIndex,
    containsToday: todayIndex !== -1,
  };
}
