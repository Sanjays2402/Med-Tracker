/**
 * Weight trend with rolling means, EMA, and outlier rejection.
 *
 * Many medications are weight-sensitive (heparin, levothyroxine,
 * metformin, anti-seizure agents, weight-loss therapy follow-up). For
 * those regimens the clinician wants the *real* trend, not the noise
 * from a single bad-scale-day reading. Raw daily numbers also bounce
 * 1-2 kg with hydration and time-of-day, so the chart has to smooth
 * before it shows anything.
 *
 * This module turns a flat weight log into:
 *
 *   1. Rolling 7-day and 30-day means anchored at each reading.
 *   2. An exponentially-weighted moving average (EMA) using a
 *      configurable alpha (default 0.25, ~ 7-day equivalent half-life)
 *      that responds faster than a flat 7-day window.
 *   3. Outlier rejection using a robust MAD test (median absolute
 *      deviation): readings whose deviation from the 7-reading rolling
 *      median exceeds `outlierMadFactor * MAD` are flagged but kept in
 *      the raw series. Flagged readings are excluded from the smoothed
 *      lines so a single mis-typed 92 kg doesn't drag a 72 kg trend.
 *   4. A direction summary (`gaining` / `stable` / `losing`) computed
 *      from the 7-day vs the 30-day mean.
 *
 * Pure / deterministic. Mass is unitless (kg or lb) — the caller picks
 * one and stays consistent. No medical guidance is generated.
 */

export interface WeightEntry {
  takenAt: string | Date;
  /** Weight in caller-chosen unit (kg or lb). */
  weight: number;
  note?: string;
}

export interface SmoothedPoint {
  takenAt: string;
  weight: number;
  /** Rolling 7-day mean ending at this point. */
  rolling7?: number;
  /** Rolling 30-day mean ending at this point. */
  rolling30?: number;
  /** EMA value at this point. */
  ema?: number;
  /** True when the reading was flagged as an outlier. */
  outlier: boolean;
}

export type TrendDirection = 'gaining' | 'stable' | 'losing' | 'insufficient';

export interface WeightTrendSummary {
  count: number;
  /** Outliers removed from smoothing. */
  outlierCount: number;
  first?: SmoothedPoint;
  last?: SmoothedPoint;
  /** Most recent 7-day mean. */
  rolling7?: number;
  /** Most recent 30-day mean. */
  rolling30?: number;
  /** Most recent EMA value. */
  ema?: number;
  /** Change in 7-day mean vs 30-day mean (positive = recent uptick). */
  deltaShortVsLong?: number;
  direction: TrendDirection;
  /** Plain-text description (not prescriptive). */
  message: string;
}

export interface WeightTrendResult {
  series: SmoothedPoint[];
  summary: WeightTrendSummary;
}

export interface WeightTrendOptions {
  /** EMA smoothing factor in (0, 1]. Higher = more reactive. Default 0.25. */
  emaAlpha?: number;
  /** MAD multiplier above which a reading is flagged outlier. Default 4. */
  outlierMadFactor?: number;
  /**
   * Minimum readings required before MAD-based outlier detection runs.
   * Default 5 (need a meaningful baseline first).
   */
  outlierMinReadings?: number;
  /** Threshold (absolute units) under which short-vs-long is "stable". Default 0.5. */
  stableDelta?: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function rollingMean(values: { t: number; w: number }[], anchorT: number, windowDays: number): number | undefined {
  const cutoff = anchorT - windowDays * 86_400_000;
  const inWin = values.filter((v) => v.t > cutoff && v.t <= anchorT);
  if (!inWin.length) return undefined;
  return round1(mean(inWin.map((v) => v.w)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarizeWeightTrend(
  entries: WeightEntry[],
  options: WeightTrendOptions = {},
): WeightTrendResult {
  const alpha = options.emaAlpha ?? 0.25;
  if (!(alpha > 0 && alpha <= 1)) {
    throw new Error('emaAlpha must be in (0, 1]');
  }
  const madFactor = options.outlierMadFactor ?? 4;
  const minForOutlier = options.outlierMinReadings ?? 5;
  const stableDelta = options.stableDelta ?? 0.5;

  if (!entries.length) {
    return {
      series: [],
      summary: {
        count: 0,
        outlierCount: 0,
        direction: 'insufficient',
        message: 'No weight entries logged.',
      },
    };
  }

  for (const e of entries) {
    if (!(e.weight > 0)) throw new Error('weight must be positive');
  }

  // Sort ascending by time.
  const sorted = [...entries]
    .map((e) => ({ ...e, takenAt: new Date(e.takenAt) }))
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  // First pass: detect outliers using a centered 7-reading rolling MAD.
  // When MAD == 0 (most readings identical) fall back to the mean absolute
  // deviation so a single jumpy reading still gets flagged.
  const flagged = new Array<boolean>(sorted.length).fill(false);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted.length < minForOutlier) break;
    const lo = Math.max(0, i - 3);
    const hi = Math.min(sorted.length, i + 4);
    const window = sorted.slice(lo, hi).map((e) => e.weight);
    if (window.length < minForOutlier) continue;
    const med = median(window);
    const deviations = window.map((w) => Math.abs(w - med));
    let scale = median(deviations);
    if (scale === 0) {
      // Fall back to a robust mean of non-zero deviations so a
      // near-constant window with one bad reading still produces a
      // usable scale. Trim to 1/8 of the mean so a single far outlier
      // (e.g. 72 -> 200) still trips the madFactor * scale threshold.
      const nonZero = deviations.filter((d) => d > 0);
      if (nonZero.length === 0) continue;
      scale = mean(nonZero) / 8;
    }
    if (Math.abs(sorted[i]!.weight - med) >= madFactor * scale) flagged[i] = true;
  }

  // Second pass: compute smoothed values using non-flagged entries.
  const cleanByT = sorted
    .map((e, i) => ({ t: e.takenAt.getTime(), w: e.weight, outlier: flagged[i]! }))
    .filter((e) => !e.outlier);

  let emaState: number | undefined;
  const series: SmoothedPoint[] = sorted.map((e, i) => {
    const t = e.takenAt.getTime();
    const point: SmoothedPoint = {
      takenAt: e.takenAt.toISOString(),
      weight: e.weight,
      outlier: flagged[i]!,
    };
    if (!flagged[i]) {
      const r7 = rollingMean(cleanByT, t, 7);
      const r30 = rollingMean(cleanByT, t, 30);
      if (r7 !== undefined) point.rolling7 = r7;
      if (r30 !== undefined) point.rolling30 = r30;
      emaState = emaState === undefined ? e.weight : alpha * e.weight + (1 - alpha) * emaState;
      point.ema = round1(emaState);
    } else if (emaState !== undefined) {
      // Outlier: carry prior EMA forward without updating, but emit it
      // so chart lines don't drop to undefined.
      point.ema = round1(emaState);
    }
    return point;
  });

  const first = series[0];
  const last = series[series.length - 1];
  const outlierCount = flagged.filter(Boolean).length;
  const lastClean = [...series].reverse().find((p) => !p.outlier);
  const r7 = lastClean?.rolling7;
  const r30 = lastClean?.rolling30;
  const delta = r7 !== undefined && r30 !== undefined
    ? round1(r7 - r30)
    : undefined;

  let direction: TrendDirection = 'insufficient';
  if (delta !== undefined) {
    if (delta > stableDelta) direction = 'gaining';
    else if (delta < -stableDelta) direction = 'losing';
    else direction = 'stable';
  } else if (sorted.length < 2) {
    direction = 'insufficient';
  }

  const message = buildMessage(direction, delta, sorted.length, outlierCount);

  const summary: WeightTrendSummary = {
    count: sorted.length,
    outlierCount,
    direction,
    message,
  };
  if (first) summary.first = first;
  if (last) summary.last = last;
  if (r7 !== undefined) summary.rolling7 = r7;
  if (r30 !== undefined) summary.rolling30 = r30;
  if (lastClean?.ema !== undefined) summary.ema = lastClean.ema;
  if (delta !== undefined) summary.deltaShortVsLong = delta;

  return { series, summary };
}

function buildMessage(
  dir: TrendDirection,
  delta: number | undefined,
  count: number,
  outliers: number,
): string {
  const parts: string[] = [];
  parts.push(`${count} reading${count === 1 ? '' : 's'} logged`);
  if (outliers > 0) {
    parts.push(`${outliers} flagged as likely scale error`);
  }
  if (dir === 'gaining' && delta !== undefined) {
    parts.push(`recent 7-day mean is ${delta} above the 30-day baseline`);
  } else if (dir === 'losing' && delta !== undefined) {
    parts.push(`recent 7-day mean is ${Math.abs(delta)} below the 30-day baseline`);
  } else if (dir === 'stable') {
    parts.push('7-day and 30-day means are within tolerance');
  } else if (dir === 'insufficient') {
    parts.push('not enough data for a trend');
  }
  return parts.join('; ') + '.';
}

/**
 * Convenience: project a future weight from the latest EMA using the
 * 7-day vs 30-day delta as a per-day slope. Returns undefined when the
 * trend is insufficient or stable.
 */
export function projectWeight(
  result: WeightTrendResult,
  daysAhead: number,
): number | undefined {
  const { summary } = result;
  if (summary.direction === 'insufficient' || summary.direction === 'stable') return undefined;
  if (summary.ema === undefined || summary.deltaShortVsLong === undefined) return undefined;
  // delta short-vs-long is roughly the change between two anchor points
  // (~7 days vs ~30 days) so per-day slope ≈ delta / 23 ≈ delta / ~22 days.
  // Use 22 to be conservative on the projection.
  const perDaySlope = summary.deltaShortVsLong / 22;
  return round1(summary.ema + perDaySlope * daysAhead);
}
