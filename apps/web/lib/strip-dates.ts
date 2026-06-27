/**
 * strip-dates — pure calendar-date labels for the dashboard 14-day strip.
 *
 * The dashboard's two-week strip draws one cell per day, the rightmost cell
 * being today. Until now each cell's hover title only said "Prior / Current
 * window avg" — it never named the actual calendar day the cell stands for.
 * This module maps a cell index to its real date (today minus N days) and
 * builds a hover title that LEADS with that date.
 *
 * Honesty note (carried from the tick-37 trend-series work): each cell's
 * percentage is a WINDOW AVERAGE, not that day's real adherence. So the title
 * names the date but phrases the number as "current/prior-window average NN%"
 * — it never implies we know that single day's number. No fabricated per-day
 * data. `now` is injectable so it is deterministic under test; all date math
 * uses local calendar parts to match how the strip renders.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function clampCells(cells: number): number {
  const c = Math.floor(cells);
  return c >= 1 ? c : 1;
}

/**
 * Whole days back from today this cell represents. The last cell (index
 * cells-1) is today => 0; the first cell is the oldest => cells-1. Out-of-range
 * indices clamp into [0, cells-1] so a caller can never read a future day.
 */
export function cellOffsetDays(index: number, cells: number): number {
  const c = clampCells(cells);
  const i = Math.min(Math.max(Math.floor(index), 0), c - 1);
  return c - 1 - i;
}

/** Local midnight Date for the cell at `index` (today minus its day offset). */
export function cellDate(index: number, cells: number, now: number = Date.now()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - cellOffsetDays(index, cells));
  return d;
}

/** Stable YYYY-MM-DD key for the cell's local date (timezone-faithful). */
export function cellDateISO(index: number, cells: number, now: number = Date.now()): string {
  const d = cellDate(index, cells, now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Friendly date label for the cell: "Today" for the last cell, "Yesterday" for
 * the one before, otherwise "Mon, Jun 16". Built from fixed weekday/month
 * tables (not toLocaleDateString) so it is locale-stable for tests and renders.
 */
export function cellDateLabel(index: number, cells: number, now: number = Date.now()): string {
  const offset = cellOffsetDays(index, cells);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  const d = cellDate(index, cells, now);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export interface StripCellTitleInput {
  index: number;
  cells: number;
  /** Whole-percent window average this cell carries (0..100). */
  pct: number;
  /** Which window the cell approximates. */
  segment: 'prior' | 'current';
  now?: number;
}

/**
 * Hover title that names the calendar date, then states the window average
 * honestly. Examples:
 *   - "Today, Jun 26 — current-window average 87%"
 *   - "Yesterday, Jun 25 — current-window average 87%"
 *   - "Mon, Jun 16 — prior-window average 80%"
 *
 * The date is exact; the percentage is explicitly a window average so the
 * tooltip never pretends to know that single day's real adherence.
 */
export function stripCellTitle(input: StripCellTitleInput): string {
  const { index, cells, pct, segment } = input;
  const now = input.now ?? Date.now();
  const offset = cellOffsetDays(index, cells);
  const d = cellDate(index, cells, now);
  const dateLabel =
    offset === 0
      ? `Today, ${MONTHS[d.getMonth()]} ${d.getDate()}`
      : offset === 1
        ? `Yesterday, ${MONTHS[d.getMonth()]} ${d.getDate()}`
        : cellDateLabel(index, cells, now);
  const windowWord = segment === 'prior' ? 'prior' : 'current';
  const safePct = Number.isFinite(pct) ? Math.round(pct) : 0;
  return `${dateLabel} — ${windowWord}-window average ${safePct}%`;
}
