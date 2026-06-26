/**
 * day-group — pure relative-day bucketing for time-ordered lists.
 *
 * Groups items that carry an ISO timestamp under relative day headers
 * ("Today", "Yesterday", weekday name within the past week, otherwise a short
 * date). Used by the /notifications list to break a long flat inbox into
 * scannable day sections; generic enough to reuse for /upcoming later.
 *
 * All the local-calendar-day math lives here (no UTC drift — buckets are keyed
 * on the viewer's local year/month/day) and is unit-tested with an injected
 * `now`. Groups come back newest-day first, items preserved in their incoming
 * order within each day.
 */

export interface DayGroup<T> {
  /** Local day key, YYYY-MM-DD (stable, sortable). */
  key: string;
  /** Relative label: "Today" / "Yesterday" / "Mon" / "Mar 3". */
  label: string;
  /** Days before today (0 = today, 1 = yesterday, ...; negative = future). */
  daysAgo: number;
  items: T[];
}

/** Local YYYY-MM-DD key for a timestamp (no UTC drift). */
export function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole local-calendar days between two timestamps (b - a), ignoring clock time. */
export function dayDelta(aMs: number, bMs: number): number {
  const a = new Date(aMs);
  const b = new Date(bMs);
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((aMid - bMid) / 86_400_000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Relative day label for a timestamp vs `now`:
 *  - 0 days  -> "Today"
 *  - 1 day   -> "Yesterday"
 *  - 2..6    -> weekday short name ("Mon")
 *  - future  -> "Tomorrow" / weekday for the next week
 *  - else    -> "Mon 3" style short date (weekday + day-of-month)
 */
export function relativeDayLabel(ms: number, now: number = Date.now()): string {
  const delta = dayDelta(now, ms); // days the item is in the past
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  if (delta === -1) return 'Tomorrow';
  if (delta >= 2 && delta <= 6) return WEEKDAYS[new Date(ms).getDay()]!;
  if (delta <= -2 && delta >= -6) return WEEKDAYS[new Date(ms).getDay()]!;
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Group items under relative day headers. `getTime` extracts an ISO string (or
 * ms) from an item. Groups are ordered newest day first; items keep their
 * incoming order inside each group. Items with an unparseable time are dropped.
 */
export function groupByDay<T>(
  items: readonly T[],
  getTime: (item: T) => string | number,
  now: number = Date.now(),
): DayGroup<T>[] {
  const buckets = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const raw = getTime(item);
    const ms = typeof raw === 'number' ? raw : +new Date(raw);
    if (!Number.isFinite(ms)) continue;
    const key = localDayKey(ms);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: relativeDayLabel(ms, now),
        daysAgo: dayDelta(now, ms),
        items: [],
      };
      buckets.set(key, bucket);
    }
    bucket.items.push(item);
  }
  // Newest day first (smallest daysAgo, including negative future days).
  return [...buckets.values()].sort((a, b) => a.daysAgo - b.daysAgo);
}
