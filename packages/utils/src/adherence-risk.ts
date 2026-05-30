import type { Dose } from '@med/types';
import { addDays, startOfDay } from './date';

/**
 * Adherence risk scoring.
 *
 * Translates a window of recent dose outcomes into a 0..1 risk score
 * predicting how likely the next scheduled dose is to be missed or
 * skipped. The model is intentionally interpretable: a weighted blend of
 * recent miss rate, time-of-day miss rate, streak fragility, and a
 * recency-weighted exponential moving average of failures. Each input
 * feature is exposed alongside the final score so the UI can explain why
 * a medication is flagged.
 *
 * This is not a clinical prediction. It is a triage signal for surfacing
 * which medications most need a nudge or a caregiver check-in.
 */

export interface RiskScoringOptions {
  /** How many days of history to consider. Default 30. */
  windowDays?: number;
  /** Half-life in days for the recency weighting. Default 7. */
  recencyHalfLifeDays?: number;
  /** Tolerance window in hours used to bucket dueAt for time-of-day stats. Default 2. */
  timeBucketHours?: number;
  /** Optional dueAt of the next dose; if supplied, time-of-day risk is computed for that bucket. */
  nextDueAt?: Date;
}

export interface RiskFeatures {
  totalDoses: number;
  missedDoses: number;
  recentMissRate: number;
  emaFailureRate: number;
  timeBucketMissRate: number | null;
  trailing7DayMissRate: number;
  lateRate: number;
  consecutiveMisses: number;
}

export interface RiskResult {
  medicationId: string;
  score: number;
  level: 'low' | 'moderate' | 'high';
  features: RiskFeatures;
  reasons: string[];
}

type Failure = 'missed' | 'skipped';
const FAILURE: Failure[] = ['missed', 'skipped'];

function isFailure(d: Dose): boolean {
  return FAILURE.includes(d.status as Failure);
}

function bucketOf(date: Date, hours: number): number {
  return Math.floor(date.getHours() / hours);
}

/**
 * Compute the per-feature inputs that feed the risk score. Pulled out for
 * unit testing and so dashboards can show the raw numbers if desired.
 */
export function computeRiskFeatures(
  doses: Dose[],
  options: RiskScoringOptions = {},
): RiskFeatures {
  const windowDays = options.windowDays ?? 30;
  const halfLife = options.recencyHalfLifeDays ?? 7;
  const bucketHours = options.timeBucketHours ?? 2;
  const now = new Date();
  const windowStart = addDays(startOfDay(now), -windowDays);

  const inWindow = doses.filter((d) => {
    const t = new Date(d.dueAt).getTime();
    return t >= windowStart.getTime() && t <= now.getTime();
  });

  const total = inWindow.length;
  const missed = inWindow.filter(isFailure).length;
  const recentMissRate = total === 0 ? 0 : missed / total;

  // EMA weights doses by recency: weight = 0.5 ^ (ageDays / halfLife).
  let weightSum = 0;
  let failWeight = 0;
  for (const d of inWindow) {
    const ageDays = (now.getTime() - new Date(d.dueAt).getTime()) / 86_400_000;
    const w = Math.pow(0.5, ageDays / halfLife);
    weightSum += w;
    if (isFailure(d)) failWeight += w;
  }
  const emaFailureRate = weightSum === 0 ? 0 : failWeight / weightSum;

  let timeBucketMissRate: number | null = null;
  if (options.nextDueAt) {
    const bucket = bucketOf(options.nextDueAt, bucketHours);
    const sameBucket = inWindow.filter((d) => bucketOf(new Date(d.dueAt), bucketHours) === bucket);
    timeBucketMissRate = sameBucket.length === 0 ? null : sameBucket.filter(isFailure).length / sameBucket.length;
  }

  const sevenDayCutoff = addDays(startOfDay(now), -7);
  const last7 = inWindow.filter((d) => new Date(d.dueAt).getTime() >= sevenDayCutoff.getTime());
  const trailing7DayMissRate = last7.length === 0 ? 0 : last7.filter(isFailure).length / last7.length;

  const lateCount = inWindow.filter((d) => d.status === 'late').length;
  const lateRate = total === 0 ? 0 : lateCount / total;

  // Count consecutive failures at the tail of chronological history.
  const sorted = [...inWindow].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
  let consecutive = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (isFailure(sorted[i])) consecutive++;
    else break;
  }

  return {
    totalDoses: total,
    missedDoses: missed,
    recentMissRate,
    emaFailureRate,
    timeBucketMissRate,
    trailing7DayMissRate,
    lateRate,
    consecutiveMisses: consecutive,
  };
}

/**
 * Score weights. Recency-weighted failures dominate, with smaller
 * contributions from the trailing-week rate, time-of-day pattern, late
 * rate (a precursor to misses), and consecutive miss streak (saturates at
 * five). Weights sum to 1.0.
 */
const W = {
  ema: 0.45,
  trailing7: 0.2,
  timeBucket: 0.15,
  late: 0.1,
  consecutive: 0.1,
};

export function scoreRisk(
  medicationId: string,
  doses: Dose[],
  options: RiskScoringOptions = {},
): RiskResult {
  const f = computeRiskFeatures(doses, options);

  if (f.totalDoses < 3) {
    return {
      medicationId,
      score: 0,
      level: 'low',
      features: f,
      reasons: ['insufficient history'],
    };
  }

  const timeBucket = f.timeBucketMissRate ?? f.recentMissRate;
  const consec = Math.min(f.consecutiveMisses, 5) / 5;

  const score =
    f.emaFailureRate * W.ema +
    f.trailing7DayMissRate * W.trailing7 +
    timeBucket * W.timeBucket +
    f.lateRate * W.late +
    consec * W.consecutive;

  const clamped = Math.max(0, Math.min(1, score));
  const level: RiskResult['level'] = clamped >= 0.45 ? 'high' : clamped >= 0.22 ? 'moderate' : 'low';

  const reasons: string[] = [];
  if (f.consecutiveMisses >= 2) reasons.push(`${f.consecutiveMisses} consecutive misses`);
  if (f.trailing7DayMissRate >= 0.3) reasons.push(`${Math.round(f.trailing7DayMissRate * 100)}% missed in last 7 days`);
  if (f.emaFailureRate >= 0.3) reasons.push(`${Math.round(f.emaFailureRate * 100)}% recency-weighted failure rate`);
  if (f.timeBucketMissRate !== null && f.timeBucketMissRate >= 0.4) {
    reasons.push(`${Math.round(f.timeBucketMissRate * 100)}% miss rate at this time of day`);
  }
  if (f.lateRate >= 0.3) reasons.push(`${Math.round(f.lateRate * 100)}% taken late`);
  if (reasons.length === 0) reasons.push('adherence stable');

  return { medicationId, score: clamped, level, features: f, reasons };
}

/** Score a batch and rank high-risk medications first. */
export function rankRisk(
  rows: { medicationId: string; doses: Dose[]; nextDueAt?: Date }[],
  options: Omit<RiskScoringOptions, 'nextDueAt'> = {},
): RiskResult[] {
  const out = rows.map((r) => scoreRisk(r.medicationId, r.doses, { ...options, nextDueAt: r.nextDueAt }));
  out.sort((a, b) => b.score - a.score);
  return out;
}
