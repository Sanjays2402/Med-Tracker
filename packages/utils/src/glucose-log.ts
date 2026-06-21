/**
 * Glucose log: pre-/post-prandial readings with in-range / hypo / hyper flags.
 *
 * People on diabetes therapy frequently log finger-stick glucose readings.
 * Each reading is classified differently depending on whether it was
 * fasting, before a meal, or 1-2 hours after a meal (post-prandial), so
 * the classifier MUST know the context.
 *
 * We default to ADA non-pregnant adult targets (the most commonly cited):
 *
 *   Fasting / pre-meal:    80-130 mg/dL
 *   Post-prandial (2h):    < 180 mg/dL
 *   Hypoglycemia:          < 70 mg/dL  (level 1: 54-69, level 2: < 54)
 *   Hyperglycemia (sev):   >= 250 mg/dL flagged as severe
 *
 * Callers can override per-patient targets via `targets` (e.g. pregnancy,
 * tight control, hypo unawareness). Units default to mg/dL but mmol/L is
 * supported via `units: 'mmol/L'` (1 mmol/L = 18 mg/dL).
 *
 * `summarizeGlucose` returns in-range %, hypo/hyper counts, mean, and
 * estimated A1C using the ADAG study formula:
 *   eA1C (%) = (mean mg/dL + 46.7) / 28.7
 *
 * Pure / deterministic. Descriptive, not prescriptive.
 */

import { addDays, startOfDay } from './date';

export type GlucoseContext = 'fasting' | 'pre-meal' | 'post-meal' | 'bedtime' | 'random';
export type GlucoseClass = 'severe-hypo' | 'hypo' | 'in-range' | 'high' | 'severe-hyper';

export interface GlucoseReading {
  takenAt: string | Date;
  /** Concentration. Default unit mg/dL; pass options.units='mmol/L' for mmol. */
  value: number;
  context: GlucoseContext;
  note?: string;
}

export interface GlucoseTargets {
  /** Lower bound for normal range, mg/dL. Default 80. */
  preMealLow?: number;
  /** Upper bound for normal range, mg/dL. Default 130. */
  preMealHigh?: number;
  /** Upper bound for post-prandial, mg/dL. Default 180. */
  postMealHigh?: number;
  /** Hypoglycemia threshold, mg/dL. Default 70. */
  hypoThreshold?: number;
  /** Severe hypoglycemia threshold, mg/dL. Default 54. */
  severeHypoThreshold?: number;
  /** Severe hyperglycemia threshold, mg/dL. Default 250. */
  severeHyperThreshold?: number;
}

export interface ClassifyOptions {
  targets?: GlucoseTargets;
  units?: 'mg/dL' | 'mmol/L';
}

const DEFAULTS: Required<GlucoseTargets> = {
  preMealLow: 80,
  preMealHigh: 130,
  postMealHigh: 180,
  hypoThreshold: 70,
  severeHypoThreshold: 54,
  severeHyperThreshold: 250,
};

function toMgDl(value: number, units: 'mg/dL' | 'mmol/L'): number {
  return units === 'mmol/L' ? value * 18 : value;
}

export function classifyGlucose(reading: GlucoseReading, options: ClassifyOptions = {}): GlucoseClass {
  if (reading.value <= 0) throw new Error('glucose value must be positive');
  const t = { ...DEFAULTS, ...options.targets };
  const v = toMgDl(reading.value, options.units ?? 'mg/dL');
  if (v < t.severeHypoThreshold) return 'severe-hypo';
  if (v < t.hypoThreshold) return 'hypo';
  if (v >= t.severeHyperThreshold) return 'severe-hyper';
  // Post-meal context uses a different high threshold than pre-meal/fasting.
  if (reading.context === 'post-meal') {
    return v >= t.postMealHigh ? 'high' : 'in-range';
  }
  if (reading.context === 'fasting' || reading.context === 'pre-meal') {
    if (v > t.preMealHigh) return 'high';
    if (v < t.preMealLow) return 'hypo'; // already covered above for < 70 but defensively
    return 'in-range';
  }
  // bedtime/random use pre-meal high as a reasonable upper bound.
  return v > t.preMealHigh ? 'high' : 'in-range';
}

export interface GlucoseSummary {
  readings: number;
  meanMgDl: number;
  /** Estimated A1C using the ADAG formula. */
  estimatedA1cPercent?: number;
  inRange: number;
  hypo: number;
  severeHypo: number;
  high: number;
  severeHyper: number;
  /** Percentage of readings (0..100) classified in-range. */
  inRangePct: number;
  /** Per-context breakdown. */
  byContext: Record<GlucoseContext, number>;
  message: string;
}

export interface GlucoseSummaryOptions extends ClassifyOptions {
  /** Window in days for summarisation. Default 14 (typical CGM review). */
  windowDays?: number;
  /** Reference "now". Defaults to the latest reading. */
  now?: Date;
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function estimateA1c(meanMgDl: number): number {
  // ADAG formula: A1c (%) = (mean mg/dL + 46.7) / 28.7
  return Math.round(((meanMgDl + 46.7) / 28.7) * 10) / 10;
}

export function summarizeGlucose(
  readings: GlucoseReading[],
  options: GlucoseSummaryOptions = {},
): GlucoseSummary {
  const byContext: Record<GlucoseContext, number> = {
    fasting: 0, 'pre-meal': 0, 'post-meal': 0, bedtime: 0, random: 0,
  };
  if (!readings.length) {
    return {
      readings: 0,
      meanMgDl: 0,
      inRange: 0,
      hypo: 0,
      severeHypo: 0,
      high: 0,
      severeHyper: 0,
      inRangePct: 0,
      byContext,
      message: 'No readings to summarize.',
    };
  }
  const windowDays = options.windowDays ?? 14;
  const units = options.units ?? 'mg/dL';
  const sorted = [...readings].sort(
    (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime(),
  );
  const now = options.now ?? new Date(sorted[sorted.length - 1]!.takenAt);
  const windowStart = addDays(startOfDay(now), -(windowDays - 1)).getTime();
  const windowed = sorted.filter((r) => new Date(r.takenAt).getTime() >= windowStart);

  let inRange = 0;
  let hypo = 0;
  let severeHypo = 0;
  let high = 0;
  let severeHyper = 0;
  const mgValues: number[] = [];
  for (const r of windowed) {
    byContext[r.context] += 1;
    const c = classifyGlucose(r, { targets: options.targets, units });
    switch (c) {
      case 'severe-hypo': severeHypo += 1; hypo += 1; break;
      case 'hypo': hypo += 1; break;
      case 'in-range': inRange += 1; break;
      case 'high': high += 1; break;
      case 'severe-hyper': severeHyper += 1; high += 1; break;
    }
    mgValues.push(toMgDl(r.value, units));
  }
  const meanMgDl = Math.round(mean(mgValues));
  const inRangePct = windowed.length
    ? Math.round((inRange / windowed.length) * 1000) / 10
    : 0;

  const message = (() => {
    if (severeHypo > 0) {
      return `${windowed.length} reading${windowed.length === 1 ? '' : 's'} in ${windowDays} days; ${severeHypo} severe hypoglycemia event${severeHypo === 1 ? '' : 's'} flagged.`;
    }
    if (severeHyper > 0) {
      return `${windowed.length} reading${windowed.length === 1 ? '' : 's'} in ${windowDays} days; ${severeHyper} severe hyperglycemia reading${severeHyper === 1 ? '' : 's'} flagged.`;
    }
    return `${windowed.length} reading${windowed.length === 1 ? '' : 's'} in ${windowDays} days; ${inRangePct}% in target range.`;
  })();

  const summary: GlucoseSummary = {
    readings: windowed.length,
    meanMgDl,
    inRange,
    hypo,
    severeHypo,
    high,
    severeHyper,
    inRangePct,
    byContext,
    message,
  };
  if (windowed.length >= 14) {
    summary.estimatedA1cPercent = estimateA1c(meanMgDl);
  }
  return summary;
}
