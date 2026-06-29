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
  /** The refill-by date (ISO) this mark plots, carried through so the renderer
   *  can name the calendar date in a hover without re-threading the input. */
  refillBy: string;
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
        refillBy: r.refillBy,
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

/** "Jun 28"-style label from a Date, using the fixed month table (locale-free). */
function shortDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Short calendar-date label for the strip's "today" anchor, e.g. "Jun 28", so
 * the today marker names the date the window is pinned to rather than just
 * reading "today". Built from a fixed month-abbreviation table (not
 * toLocaleDateString) so it is deterministic regardless of the host locale, and
 * uses the LOCAL date of `now` to match how the marker positions on the strip.
 * Pure; `now` is injectable.
 */
export function todayLabel(now: number = Date.now()): string {
  return shortDate(new Date(now));
}

/**
 * Short calendar-date label for ONE mark's refill-by date, e.g. "Jul 1", from
 * the same fixed month table todayLabel uses so the hover names the date rather
 * than only a relative "in Nd". Returns "" when the mark's date is unparseable.
 * Pure; uses the mark's own refillBy (carried through buildTimeline).
 */
export function markDateLabel(mark: Pick<TimelineMark, 'refillBy'>): string {
  return shortDate(new Date(mark.refillBy));
}

/**
 * Relative phrasing for a mark, matching the strip's existing inline copy:
 * "2d overdue" when past, "today" on day zero, "in 3d" ahead. Pure; reads the
 * mark's daysFromNow so the relative text always agrees with where the dot sits.
 */
export function markRelativeLabel(mark: Pick<TimelineMark, 'daysFromNow'>): string {
  const d = mark.daysFromNow;
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'today';
  return `in ${d}d`;
}

/**
 * Full hover title for a mark, leading with the calendar DATE then the relative
 * phrasing so a hover reads "Atorvastatin · Jul 1 · in 3d" — the date names the
 * day, the relative clause says how soon. Falls back to medication + relative
 * only when the date can't be parsed (so a bad date never shows a stray
 * separator). Pure; composes markDateLabel + markRelativeLabel.
 */
export function markTitle(
  mark: Pick<TimelineMark, 'medicationName' | 'refillBy' | 'daysFromNow'>,
): string {
  // An overdue mark reads more clearly in the past tense.
  if (mark.daysFromNow < 0) return markTitleOverdue(mark);
  const date = markDateLabel(mark);
  const rel = markRelativeLabel(mark);
  return date
    ? `${mark.medicationName} · ${date} · ${rel}`
    : `${mark.medicationName} · ${rel}`;
}

/**
 * Past-tense hover title for an OVERDUE mark, framing the relative clause as
 * "was due Nd ago" instead of "Nd overdue" so the title reads naturally for a
 * date already behind us: "Amoxicillin · Jun 23 · was due 2d ago". The
 * day-zero case (due today, just past the boundary) reads "was due today". Falls
 * back to medication + clause when the date can't be parsed so a bad date never
 * leaves a stray separator. Pure; markTitle delegates here for the overdue
 * branch so the strip never has to special-case the past tense itself.
 */
export function markTitleOverdue(
  mark: Pick<TimelineMark, 'medicationName' | 'refillBy' | 'daysFromNow'>,
): string {
  const d = mark.daysFromNow;
  const clause = d < 0 ? `was due ${-d}d ago` : 'was due today';
  const date = markDateLabel(mark);
  return date
    ? `${mark.medicationName} · ${date} · ${clause}`
    : `${mark.medicationName} · ${clause}`;
}

/** Tone -> mark count, every tone present (0 when none). */
export type TimelineLegendCounts = Record<TimelineTone, number>;

/**
 * Tally the strip's marks by tone so each legend dot can name how many refills
 * fall under it ("overdue 2", "within a week 1"). Every tone is present with a
 * count (0 when none) so the renderer never misses a key and the legend stays
 * fixed-order. Pure; reads the same marks buildTimeline already classified, so
 * the counts can never disagree with the dots they sit beside.
 */
export function legendCounts(marks: readonly Pick<TimelineMark, 'tone'>[]): TimelineLegendCounts {
  const out: TimelineLegendCounts = { overdue: 0, soon: 0, later: 0, done: 0 };
  for (const m of marks) out[m.tone]++;
  return out;
}

/**
 * Compact suffix for a legend label given a tone count: " 2" when there are
 * marks of that tone, "" when none (so the renderer drops a bare "overdue 0").
 * The space-prefix lets the caller write `${label}${legendCountSuffix(n)}` and
 * get "overdue 2" / "overdue" without conditional templating. Negative / NaN
 * counts coerce to nothing. Pure.
 */
export function legendCountSuffix(count: number): string {
  return Number.isFinite(count) && count > 0 ? ` ${Math.trunc(count)}` : '';
}
