/**
 * trend-series — pure, HONEST 14-day adherence strip for the dashboard.
 *
 * The dashboard shows a 14-cell strip under the adherence ring. It used to fill
 * each cell with hash-seeded pseudo-random "wobble" around the average, which
 * INVENTS daily variance the app does not actually have. This module replaces
 * that with a model that never fabricates per-day numbers:
 *
 *   - With a prior-window baseline: the older cells carry the prior window's
 *     average adherence and the newer cells carry the current window's average,
 *     so the strip's single step mirrors the real this-vs-prior trend arrow.
 *   - Without a prior baseline: every cell carries the current average (a flat
 *     strip) — an honest "we only know the overall rate, not each day."
 *
 * When the API later carries a real per-day series, callers can pass it straight
 * through `seriesFromDaily` and skip the counts-based approximation entirely.
 * No React, no Date.now(). Percentages are whole numbers in 0..100.
 */

import { adherencePercent } from './adherence-trend';

export type TrendSegment = 'prior' | 'current';

export interface TrendCell {
  /** Whole-percent adherence for the cell (0..100). */
  pct: number;
  /** Which window this cell approximates. */
  segment: TrendSegment;
  /** True for the final (most recent) cell. */
  isToday: boolean;
  /** True when the value is a real per-day datum rather than a window average. */
  real: boolean;
}

export interface TrendSeriesCounts {
  taken: number;
  scheduled: number;
  /** Prior-window taken; pairs with priorScheduled. Absent => no baseline. */
  priorTaken?: number | undefined;
  priorScheduled?: number | undefined;
}

export interface TrendSeriesOptions {
  /** Number of cells in the strip. Default 14. */
  cells?: number;
}

const DEFAULT_CELLS = 14;

function clampCells(n: number | undefined): number {
  const c = Math.floor(n ?? DEFAULT_CELLS);
  return c >= 1 ? c : DEFAULT_CELLS;
}

/**
 * Build the strip from aggregate counts. The newer half of the cells reflects
 * the current window's average; the older half reflects the prior window's
 * average when a baseline exists, else the current average (flat). The split is
 * the midpoint so a 14-cell strip is 7 prior + 7 current.
 *
 * No per-day variance is invented: within a segment every cell shares that
 * window's true average, which is the most the aggregate honestly supports.
 */
export function seriesFromCounts(
  counts: TrendSeriesCounts,
  opts: TrendSeriesOptions = {},
): TrendCell[] {
  const cells = clampCells(opts.cells);
  const currentPct = adherencePercent(counts.taken, counts.scheduled);
  const hasPrior =
    typeof counts.priorScheduled === 'number' &&
    counts.priorScheduled > 0 &&
    typeof counts.priorTaken === 'number';
  const priorPct = hasPrior
    ? adherencePercent(counts.priorTaken as number, counts.priorScheduled as number)
    : currentPct;

  // Newer half is "current"; older half is "prior" (or current when no baseline).
  const splitAt = Math.floor(cells / 2);
  const out: TrendCell[] = [];
  for (let i = 0; i < cells; i++) {
    const isCurrent = i >= splitAt;
    out.push({
      pct: isCurrent ? currentPct : priorPct,
      segment: isCurrent || !hasPrior ? 'current' : 'prior',
      isToday: i === cells - 1,
      real: false,
    });
  }
  return out;
}

/**
 * Build the strip from a real per-day percentage series (most recent last).
 * Takes the trailing `cells` values, marks them `real`, and flags the last one
 * as today. Use this once the API returns honest daily numbers.
 */
export function seriesFromDaily(
  daily: readonly number[],
  opts: TrendSeriesOptions = {},
): TrendCell[] {
  const cells = clampCells(opts.cells);
  const tail = daily.slice(-cells);
  return tail.map((raw, i) => ({
    pct: adherencePercent(Math.round(raw), 100),
    segment: 'current' as const,
    isToday: i === tail.length - 1,
    real: true,
  }));
}

export interface TrendSeriesMeta {
  cells: TrendCell[];
  /** True when the strip shows a real prior-vs-current step (a baseline exists). */
  hasStep: boolean;
  /** The current-window average the newer cells carry. */
  currentPct: number;
  /** The prior-window average the older cells carry (equals current when flat). */
  priorPct: number;
}

/**
 * Counts-based strip plus a little metadata the caption can use: whether the
 * strip shows a real step, and the two window averages. Saves the dashboard
 * recomputing them for its "two weeks ago -> today" labels.
 */
export function trendSeriesMeta(
  counts: TrendSeriesCounts,
  opts: TrendSeriesOptions = {},
): TrendSeriesMeta {
  const cells = seriesFromCounts(counts, opts);
  const hasStep =
    typeof counts.priorScheduled === 'number' &&
    counts.priorScheduled > 0 &&
    typeof counts.priorTaken === 'number';
  const currentPct = adherencePercent(counts.taken, counts.scheduled);
  const priorPct = hasStep
    ? adherencePercent(counts.priorTaken as number, counts.priorScheduled as number)
    : currentPct;
  return { cells, hasStep, currentPct, priorPct };
}
