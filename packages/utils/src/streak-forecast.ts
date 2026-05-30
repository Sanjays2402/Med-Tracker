import { startOfDay, addDays } from './date';
import type { DoseLike } from './streak';

/**
 * Streak survival forecasting.
 *
 * Given a history of scheduled doses with their actual taken state, estimate
 * the probability that a user's current streak survives N additional days.
 *
 * The model is intentionally simple and deterministic so it can run client-side
 * without an ML runtime:
 *   - per-weekday hit rates (Mon..Sun) computed with Laplace smoothing,
 *   - recency weighting that discounts older days exponentially,
 *   - independent-day survival product across the forecast horizon.
 *
 * Confidence bands come from a Wilson-style interval on the per-day rate,
 * widened by the effective sample size of the recency-weighted history.
 */

export interface StreakForecastInput {
  doses: DoseLike[];
  /** Forecast horizon in days. Default 14. */
  horizonDays?: number;
  /** Days after which a dose contributes 1/e of its current weight. Default 30. */
  recencyHalfLifeDays?: number;
  /** Reference "now" so the forecast is reproducible in tests. Default new Date(). */
  now?: Date;
}

export interface DailySurvivalPoint {
  /** ISO date (UTC midnight) the projection covers. */
  date: string;
  /** Estimated probability the streak is still alive by end of this day. */
  survivalProbability: number;
  /** Lower bound of the 95% confidence interval on survival. */
  lowerBound: number;
  /** Upper bound of the 95% confidence interval on survival. */
  upperBound: number;
  /** Weekday-specific hit rate used for this day (0..1). */
  dailyHitRate: number;
}

export interface StreakForecast {
  horizonDays: number;
  /** Overall recency-weighted daily hit rate (0..1). */
  overallHitRate: number;
  /** Effective sample size after recency weighting. */
  effectiveSampleSize: number;
  /** Per-weekday hit rates indexed 0=Sunday..6=Saturday. */
  weekdayHitRates: number[];
  /** Day-by-day projection from day 1 to day N. */
  projection: DailySurvivalPoint[];
  /** Probability of surviving the full horizon (last day's survival). */
  horizonSurvival: number;
  /** Lower 95% bound on horizon survival. */
  horizonLower: number;
  /** Upper 95% bound on horizon survival. */
  horizonUpper: number;
  /** Day index (1-based) where survival first dips below 50%, or null. */
  medianBreakDay: number | null;
  summary: string;
}

const Z = 1.96; // 95% normal approximation.

function dayHit(d: DoseLike): boolean {
  return d.takenAt !== null;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Recency-weighted Laplace-smoothed hit rate.
 *
 * Returns the smoothed rate plus the effective sample size (sum of weights)
 * so callers can derive confidence intervals.
 */
function weightedRate(
  doses: DoseLike[],
  now: Date,
  halfLifeDays: number,
  weekdayFilter: number | null,
): { rate: number; ess: number } {
  const lambda = Math.log(2) / halfLifeDays;
  let wSum = 0;
  let hitSum = 0;
  for (const d of doses) {
    const due = new Date(d.dueAt);
    if (weekdayFilter !== null && due.getUTCDay() !== weekdayFilter) continue;
    const ageDays = Math.max(0, (now.getTime() - due.getTime()) / 86_400_000);
    const w = Math.exp(-lambda * ageDays);
    wSum += w;
    if (dayHit(d)) hitSum += w;
  }
  // Laplace smoothing with a weak symmetric prior scaled to a single dose so
  // a long perfect history is not pulled noticeably away from 1.
  const rate = (hitSum + 0.5) / (wSum + 1);
  return { rate: clamp01(rate), ess: wSum };
}

function wilson(rate: number, ess: number): { lower: number; upper: number } {
  if (ess <= 0) return { lower: 0, upper: 1 };
  const n = ess;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = (rate + z2 / (2 * n)) / denom;
  const margin = (Z * Math.sqrt((rate * (1 - rate)) / n + z2 / (4 * n * n))) / denom;
  return { lower: clamp01(center - margin), upper: clamp01(center + margin) };
}

export function forecastStreakSurvival(input: StreakForecastInput): StreakForecast {
  const {
    doses,
    horizonDays = 14,
    recencyHalfLifeDays = 30,
    now = new Date(),
  } = input;

  const ref = startOfDay(now);

  // Overall rate.
  const overall = weightedRate(doses, ref, recencyHalfLifeDays, null);

  // Per-weekday rates (0=Sun..6=Sat). If a weekday has very low ESS, fall
  // back toward the overall rate via a simple shrinkage.
  const weekday: number[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const wd = weightedRate(doses, ref, recencyHalfLifeDays, dow);
    // Shrinkage weight: weekday rate matters more once ESS exceeds ~3.
    const k = wd.ess / (wd.ess + 3);
    weekday.push(clamp01(k * wd.rate + (1 - k) * overall.rate));
  }

  const projection: DailySurvivalPoint[] = [];
  let survival = 1;
  let lower = 1;
  let upper = 1;
  let medianBreak: number | null = null;

  for (let i = 1; i <= horizonDays; i++) {
    const day = addDays(ref, i);
    const dow = day.getUTCDay();
    const rate = weekday[dow]!;
    const { lower: rl, upper: ru } = wilson(rate, Math.max(overall.ess, 1));
    survival *= rate;
    lower *= rl;
    upper *= ru;
    if (medianBreak === null && survival < 0.5) medianBreak = i;
    projection.push({
      date: day.toISOString(),
      survivalProbability: survival,
      lowerBound: lower,
      upperBound: upper,
      dailyHitRate: rate,
    });
  }

  const horizonSurvival = projection.length ? projection[projection.length - 1]!.survivalProbability : 1;
  const horizonLower = projection.length ? projection[projection.length - 1]!.lowerBound : 1;
  const horizonUpper = projection.length ? projection[projection.length - 1]!.upperBound : 1;

  const pct = Math.round(horizonSurvival * 100);
  let summary: string;
  if (doses.length === 0) {
    summary = 'No dose history yet; forecast is a weak prior.';
  } else if (medianBreak !== null) {
    summary = `About ${pct}% chance the streak survives ${horizonDays} days; most likely break around day ${medianBreak}.`;
  } else {
    summary = `About ${pct}% chance the streak survives the full ${horizonDays}-day horizon.`;
  }

  return {
    horizonDays,
    overallHitRate: overall.rate,
    effectiveSampleSize: overall.ess,
    weekdayHitRates: weekday,
    projection,
    horizonSurvival,
    horizonLower,
    horizonUpper,
    medianBreakDay: medianBreak,
    summary,
  };
}
