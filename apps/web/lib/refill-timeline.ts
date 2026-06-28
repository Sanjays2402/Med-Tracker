/**
 * refill-timeline — pure layout math for the /refills horizontal timeline strip.
 *
 * Plots each refill's refill-by date onto a fixed horizontal window (default the
 * next 30 days) so a user sees at a glance which refills cluster together and
 * which are already overdue. The component stays a dumb SVG/flex renderer; all
 * the day-delta math, clamping, lane stacking, and overdue classification lives
 * here and is unit-tested with an injected `now`.
 *
 * Positions are returned as fractions 0..1 across the window so the renderer can
 * multiply by whatever pixel width it lays out at.
 */

export interface TimelineRefillInput {
  id: string;
  medicationName: string;
  refillBy: string; // ISO
  status: 'needed' | 'requested' | 'ready' | 'picked_up';
}

export type TimelineTone = 'overdue' | 'soon' | 'later' | 'done';

export interface TimelineMark {
  id: string;
  medicationName: string;
  /** Whole days from `now` to refillBy (negative = overdue). */
  daysFromNow: number;
  /** Fractional 0..1 position across the window (clamped). */
  position: number;
  /** True when refillBy is before `now`. */
  overdue: boolean;
  tone: TimelineTone;
  /** Lane index for vertical stacking when marks are close together. */
  lane: number;
}

export interface TimelineModel {
  /** Total window length in days. */
  windowDays: number;
  /** Fractional 0..1 position of "today" within the window. */
  todayPosition: number;
  /** Whether any mark is overdue (renderer shows the overdue zone). */
  hasOverdue: boolean;
  /** Day gridlines as fractional positions with their day offset label. */
  ticks: Array<{ position: number; dayOffset: number }>;
  marks: TimelineMark[];
}

export interface TimelineOptions {
  /** Total window length in days. Default 30. */
  windowDays?: number;
  /** How many days BEFORE today the strip shows (the overdue gutter). Default 3. */
  overdueGutterDays?: number;
  /** Day interval between gridline ticks. Default 7. */
  tickEveryDays?: number;
  /** How close (in fractional position) two marks must be to share a lane test. Default 0.06. */
  laneGap?: number;
}

/** Days (calendar, rounded toward zero at the day boundary) from now to an ISO date. */
export function daysFromNow(iso: string, now: number): number {
  const then = +new Date(iso);
  if (!Number.isFinite(then)) return 0;
  return Math.round((then - now) / 86_400_000);
}

function toneFor(days: number, overdue: boolean, status: TimelineRefillInput['status']): TimelineTone {
  if (status === 'ready' || status === 'picked_up') return 'done';
  if (overdue) return 'overdue';
  if (days <= 7) return 'soon';
  return 'later';
}

export function buildTimeline(
  refills: readonly TimelineRefillInput[],
  now: number = Date.now(),
  opts: TimelineOptions = {},
): TimelineModel {
  const windowDays = Math.max(1, opts.windowDays ?? 30);
  const gutter = Math.max(0, opts.overdueGutterDays ?? 3);
  const tickEvery = Math.max(1, opts.tickEveryDays ?? 7);
  const laneGap = opts.laneGap ?? 0.06;

  // The window spans [-gutter, windowDays] in days; total span used for mapping.
  const span = gutter + windowDays;
  const dayToPos = (d: number) => clamp01((d + gutter) / span);

  const todayPosition = dayToPos(0);

  // Build marks sorted left-to-right, then assign lanes greedily so near-
  // coincident marks stack instead of overlapping.
  const sorted = [...refills]
    .map((r) => {
      const d = daysFromNow(r.refillBy, now);
      const overdue = +new Date(r.refillBy) < now;
      return {
        id: r.id,
        medicationName: r.medicationName,
        daysFromNow: d,
        position: dayToPos(d),
        overdue,
        tone: toneFor(d, overdue, r.status),
      };
    })
    .sort((a, b) => a.position - b.position);

  const laneEnds: number[] = []; // rightmost position occupied per lane
  const marks: TimelineMark[] = sorted.map((m) => {
    let lane = laneEnds.findIndex((end) => m.position - end > laneGap);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(m.position);
    } else {
      laneEnds[lane] = m.position;
    }
    return { ...m, lane };
  });

  const ticks: Array<{ position: number; dayOffset: number }> = [];
  for (let d = 0; d <= windowDays; d += tickEvery) {
    ticks.push({ position: dayToPos(d), dayOffset: d });
  }

  return {
    windowDays,
    todayPosition,
    hasOverdue: marks.some((m) => m.overdue),
    ticks,
    marks,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Short calendar-date label for the strip's "today" anchor, e.g. "Jun 28", so
 * the today marker names the date the window is pinned to rather than just
 * reading "today". Built from a fixed month-abbreviation table (not
 * toLocaleDateString) so it is deterministic regardless of the host locale, and
 * uses the LOCAL date of `now` to match how the marker positions on the strip.
 * Pure; `now` is injectable.
 */
export function todayLabel(now: number = Date.now()): string {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}
