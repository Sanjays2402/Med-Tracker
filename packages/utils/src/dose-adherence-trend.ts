/**
 * Adherence trend with linear regression and 30-day projection.
 *
 * dose-history-aggregator gives a per-bucket adherence number; what the
 * dashboard wants on top of that is *direction*: is the patient drifting
 * up, down, or flat over the last N weeks? And given the current slope,
 * where will they land at the next refill or at the 90-day mark?
 *
 * This module fits a simple least-squares line through the per-bucket
 * adherence series (excluding empty buckets) and reports:
 *
 *   - slopePerDay: change in adherence per day (negative = declining),
 *   - intercept: extrapolated adherence at day 0 of the window,
 *   - r2: coefficient of determination so the UI can de-emphasize
 *     weak fits ("trend uncertain, more data needed"),
 *   - projectedAt30Days: predicted adherence 30 days after the last
 *     bucket end, clamped to [0, 1],
 *   - direction: 'improving' / 'stable' / 'declining' /
 *     'insufficient' from the slope and a configurable tolerance,
 *   - flag: whether the projected value falls below the CMS-adherence
 *     threshold (default 0.8).
 *
 * Pure / deterministic. Operates on the buckets produced by
 * aggregateDoseHistory so the two modules compose directly.
 */

import type { DoseAggregation, DoseBucket } from './dose-history-aggregator';

export type AdherenceTrendDirection = 'improving' | 'stable' | 'declining' | 'insufficient';

export interface AdherenceTrend {
  /** Buckets actually used in the fit (denominator > 0). */
  usedBuckets: number;
  /** Total buckets considered. */
  totalBuckets: number;
  /** Slope of adherence per day; positive = improving. */
  slopePerDay: number;
  /** Intercept at day 0 (the start of the window). */
  intercept: number;
  /** Coefficient of determination in [0, 1]; undefined when < 2 points. */
  r2?: number;
  /** Projected adherence ratio N days after the last bucket. */
  projectedAt30Days?: number;
  /** Current (last bucket) adherence. */
  currentAdherence?: number;
  direction: AdherenceTrendDirection;
  /** True when projection falls below `belowThreshold` (default 0.8). */
  belowThresholdAtProjection: boolean;
  /** Plain text description for the UI. */
  message: string;
}

export interface AdherenceTrendOptions {
  /**
   * Slope magnitude (per day) below which the trend is "stable" rather
   * than improving/declining. Default 0.0005 (~ 1.5% per month).
   */
  stableSlope?: number;
  /**
   * Days ahead to project. Default 30.
   */
  projectionDays?: number;
  /**
   * Threshold below which `belowThresholdAtProjection` flips true.
   * Default 0.8 (CMS adherent threshold).
   */
  belowThreshold?: number;
  /**
   * Minimum r2 below which direction reverts to 'insufficient' even
   * if the slope is significant. Default 0.1 (weak signal).
   */
  minR2?: number;
}

interface FitInput {
  /** Days since window start (x). */
  x: number;
  /** Adherence ratio in [0, 1] (y). */
  y: number;
}

function leastSquares(points: FitInput[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0]!.y : 0, r2: 0 };
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  let totSqY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    den += dx * dx;
    totSqY += dy * dy;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let resSq = 0;
  for (const p of points) {
    const pred = intercept + slope * p.x;
    const r = p.y - pred;
    resSq += r * r;
  }
  const r2 = totSqY === 0 ? 1 : Math.max(0, 1 - resSq / totSqY);
  return { slope, intercept, r2 };
}

function bucketDurationDays(b: DoseBucket): number {
  const start = new Date(b.start).getTime();
  const end = new Date(b.end).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeAdherenceTrend(
  aggregation: DoseAggregation,
  options: AdherenceTrendOptions = {},
): AdherenceTrend {
  const stableSlope = options.stableSlope ?? 0.0005;
  const projectionDays = options.projectionDays ?? 30;
  const belowThreshold = options.belowThreshold ?? 0.8;
  const minR2 = options.minR2 ?? 0.1;

  const total = aggregation.buckets.length;
  // Skip empty buckets (no scheduled doses) so they don't drag the fit
  // toward 0. We keep their slot in the x-axis though so spacing is
  // preserved.
  const filtered = aggregation.buckets.filter(
    (b) => b.taken + b.late + b.missed > 0,
  );

  if (filtered.length === 0) {
    return {
      usedBuckets: 0,
      totalBuckets: total,
      slopePerDay: 0,
      intercept: 0,
      direction: 'insufficient',
      belowThresholdAtProjection: false,
      message: 'No doses with adherence signal in the window.',
    };
  }

  const windowStart = new Date(aggregation.buckets[0]!.start).getTime();
  const points: FitInput[] = filtered.map((b) => ({
    x: Math.round((new Date(b.start).getTime() - windowStart) / 86_400_000),
    y: b.adherence,
  }));

  const fit = leastSquares(points);

  const last = aggregation.buckets[aggregation.buckets.length - 1]!;
  const lastEndMs = new Date(last.end).getTime();
  const projectionX =
    Math.round((lastEndMs - windowStart) / 86_400_000) + projectionDays;
  const projected = clamp01(fit.intercept + fit.slope * projectionX);

  let direction: AdherenceTrendDirection = 'stable';
  if (filtered.length < 2) {
    direction = 'insufficient';
  } else if (fit.r2 < minR2 && Math.abs(fit.slope) >= stableSlope) {
    // Slope is non-trivial but fit is weak -> mark as insufficient.
    direction = 'insufficient';
  } else if (fit.slope > stableSlope) {
    direction = 'improving';
  } else if (fit.slope < -stableSlope) {
    direction = 'declining';
  }

  const currentAdherence = filtered[filtered.length - 1]!.adherence;
  const belowFlag = projected < belowThreshold;

  const message = buildMessage(direction, fit.slope, projected, belowFlag, belowThreshold);

  const result: AdherenceTrend = {
    usedBuckets: filtered.length,
    totalBuckets: total,
    slopePerDay: round3(fit.slope * 1000) / 1000, // round to 6 decimals via scale
    intercept: round3(fit.intercept),
    direction,
    belowThresholdAtProjection: belowFlag,
    message,
  };
  // Use more precise rounding for slopePerDay (it can be tiny).
  result.slopePerDay = Number(fit.slope.toFixed(6));
  if (filtered.length >= 2) {
    result.r2 = round3(fit.r2);
    result.projectedAt30Days = round3(projected);
  }
  result.currentAdherence = round3(currentAdherence);
  return result;
}

function buildMessage(
  direction: AdherenceTrendDirection,
  slope: number,
  projected: number,
  belowFlag: boolean,
  threshold: number,
): string {
  const pctPerMonth = (slope * 30 * 100).toFixed(1);
  const dirText = (() => {
    switch (direction) {
      case 'improving':
        return `Adherence improving by ${pctPerMonth}% per month`;
      case 'declining':
        return `Adherence declining by ${Math.abs(Number(pctPerMonth)).toFixed(1)}% per month`;
      case 'stable':
        return 'Adherence stable';
      case 'insufficient':
        return 'Trend uncertain; more data needed';
    }
  })();
  const projText = direction !== 'insufficient'
    ? `; projected to ${(projected * 100).toFixed(0)}% in 30 days`
    : '';
  const flagText = belowFlag && direction !== 'insufficient'
    ? `; below ${(threshold * 100).toFixed(0)}% threshold`
    : '';
  return `${dirText}${projText}${flagText}.`;
}

/**
 * Convenience: given the trend, how many days until projected
 * adherence crosses below `threshold`? Returns null when the trend
 * is non-declining or never crosses within `horizonDays`.
 */
export function daysUntilBelow(
  trend: AdherenceTrend,
  threshold = 0.8,
  horizonDays = 365,
): number | null {
  if (trend.direction !== 'declining') return null;
  if (trend.slopePerDay >= 0) return null;
  // Current ~ intercept + slope * (now days since window start).
  // We don't have the "now in days" so use currentAdherence as the
  // starting point and slope going forward.
  const current = trend.currentAdherence;
  if (current === undefined || current < threshold) return 0;
  const days = (threshold - current) / trend.slopePerDay;
  if (days <= 0 || days > horizonDays) return null;
  return Math.ceil(days);
}
