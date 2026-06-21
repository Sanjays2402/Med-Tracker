/**
 * Blood-pressure paired reading log with classification.
 *
 * Med-Tracker users on antihypertensive medication frequently log home
 * BP readings to share with their cardiologist. A "reading" is the pair
 * (systolic, diastolic) sometimes accompanied by a pulse. Two ergonomic
 * decisions surface again and again in product:
 *
 *   1. Classify the reading using a published guideline so the user
 *      can see "Stage 1" or "Hypertensive crisis" without checking a
 *      chart. We implement the 2017 ACC/AHA categories (the most
 *      commonly cited in US guidance):
 *
 *        Normal:       SBP < 120 AND DBP < 80
 *        Elevated:     SBP 120-129 AND DBP < 80
 *        Stage 1:      SBP 130-139 OR DBP 80-89
 *        Stage 2:      SBP >= 140 OR DBP >= 90
 *        Crisis:       SBP > 180 OR DBP > 120
 *
 *   2. Compute trend statistics (mean, median, 7-day rolling average)
 *      that mirror what a cardiologist would summarise at a visit.
 *
 * The classifier is intentionally explicit: when systolic and diastolic
 * land in DIFFERENT categories, the higher of the two wins (this is the
 * AHA-recommended approach).
 *
 * NEVER provide treatment guidance from these functions. The
 * `summary.message` field is descriptive, not prescriptive.
 *
 * Pure / deterministic. No I/O.
 */

import { addDays, startOfDay } from './date';

export type BpCategory =
  | 'normal'
  | 'elevated'
  | 'stage-1'
  | 'stage-2'
  | 'crisis'
  | 'low';

export interface BpReading {
  /** ISO timestamp when the reading was taken. */
  takenAt: string | Date;
  systolic: number;
  diastolic: number;
  pulse?: number;
  /** Optional patient-supplied note. */
  note?: string;
  /** Arm used; for follow-up consistency. */
  arm?: 'left' | 'right';
}

export interface ClassifiedReading extends BpReading {
  category: BpCategory;
  pulseClassification?: 'bradycardia' | 'normal' | 'tachycardia';
}

export interface BpSummary {
  readings: number;
  meanSystolic: number;
  meanDiastolic: number;
  meanPulse?: number;
  medianSystolic: number;
  medianDiastolic: number;
  /** Highest single-reading category in the window. */
  worstCategory: BpCategory;
  /** Distribution of categories within the window. */
  distribution: Record<BpCategory, number>;
  /** 7-day rolling mean systolic/diastolic at the most recent reading. */
  rolling7Systolic?: number;
  rolling7Diastolic?: number;
  /** Plain-text descriptive (NOT prescriptive) message. */
  message: string;
}

export function classifyBp(reading: BpReading): BpCategory {
  const { systolic: s, diastolic: d } = reading;
  if (s <= 0 || d <= 0) throw new Error('systolic and diastolic must be positive');
  if (s > 180 || d > 120) return 'crisis';
  // Low blood pressure (hypotension): SBP < 90 OR DBP < 60.
  if (s < 90 || d < 60) return 'low';
  if (s >= 140 || d >= 90) return 'stage-2';
  if (s >= 130 || d >= 80) return 'stage-1';
  if (s >= 120) return 'elevated'; // and d < 80 by previous checks
  return 'normal';
}

export function classifyPulse(pulse: number): 'bradycardia' | 'normal' | 'tachycardia' {
  if (pulse < 60) return 'bradycardia';
  if (pulse > 100) return 'tachycardia';
  return 'normal';
}

export function classifyReading(reading: BpReading): ClassifiedReading {
  const out: ClassifiedReading = {
    ...reading,
    category: classifyBp(reading),
  };
  if (reading.pulse != null) out.pulseClassification = classifyPulse(reading.pulse);
  return out;
}

const CATEGORY_RANK: Record<BpCategory, number> = {
  low: 0,
  normal: 1,
  elevated: 2,
  'stage-1': 3,
  'stage-2': 4,
  crisis: 5,
};

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

export interface BpSummaryOptions {
  /** Window to consider in days. Default 30 (matches typical home BP review). */
  windowDays?: number;
  /** Reference "now"; defaults to the latest reading in the list. */
  now?: Date;
}

export function summarizeBp(
  readings: BpReading[],
  options: BpSummaryOptions = {},
): BpSummary {
  if (!readings.length) {
    return {
      readings: 0,
      meanSystolic: 0,
      meanDiastolic: 0,
      medianSystolic: 0,
      medianDiastolic: 0,
      worstCategory: 'normal',
      distribution: { low: 0, normal: 0, elevated: 0, 'stage-1': 0, 'stage-2': 0, crisis: 0 },
      message: 'No readings to summarize.',
    };
  }
  const windowDays = options.windowDays ?? 30;
  const sorted = [...readings].sort(
    (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime(),
  );
  const now = options.now ?? new Date(sorted[sorted.length - 1]!.takenAt);
  const windowStart = addDays(startOfDay(now), -(windowDays - 1)).getTime();
  const windowed = sorted.filter((r) => new Date(r.takenAt).getTime() >= windowStart);

  const systolics = windowed.map((r) => r.systolic);
  const diastolics = windowed.map((r) => r.diastolic);
  const pulses = windowed.map((r) => r.pulse).filter((p): p is number => p != null);

  const distribution: Record<BpCategory, number> = {
    low: 0, normal: 0, elevated: 0, 'stage-1': 0, 'stage-2': 0, crisis: 0,
  };
  let worst: BpCategory = 'low';
  for (const r of windowed) {
    const c = classifyBp(r);
    distribution[c] += 1;
    if (CATEGORY_RANK[c] > CATEGORY_RANK[worst]) worst = c;
  }
  // If everyone is "low" the worst is still low; if no readings normalize.
  if (windowed.every((r) => classifyBp(r) === 'normal')) worst = 'normal';

  // 7-day rolling at the most recent reading.
  const rollingStart = addDays(startOfDay(now), -6).getTime();
  const rolling = windowed.filter((r) => new Date(r.takenAt).getTime() >= rollingStart);
  const rolling7Systolic = rolling.length ? Math.round(mean(rolling.map((r) => r.systolic))) : undefined;
  const rolling7Diastolic = rolling.length ? Math.round(mean(rolling.map((r) => r.diastolic))) : undefined;

  const summary: BpSummary = {
    readings: windowed.length,
    meanSystolic: Math.round(mean(systolics)),
    meanDiastolic: Math.round(mean(diastolics)),
    medianSystolic: Math.round(median(systolics)),
    medianDiastolic: Math.round(median(diastolics)),
    worstCategory: worst,
    distribution,
    message: messageFor(worst, windowed.length, windowDays),
  };
  if (pulses.length) summary.meanPulse = Math.round(mean(pulses));
  if (rolling7Systolic != null) summary.rolling7Systolic = rolling7Systolic;
  if (rolling7Diastolic != null) summary.rolling7Diastolic = rolling7Diastolic;
  return summary;
}

function messageFor(category: BpCategory, count: number, windowDays: number): string {
  const base = `${count} reading${count === 1 ? '' : 's'} in the last ${windowDays} day${windowDays === 1 ? '' : 's'}`;
  switch (category) {
    case 'crisis':
      return `${base}. One or more readings are in the hypertensive crisis range; contact a clinician.`;
    case 'stage-2':
      return `${base}. Highest reading falls in Stage 2 hypertension.`;
    case 'stage-1':
      return `${base}. Highest reading falls in Stage 1 hypertension.`;
    case 'elevated':
      return `${base}. Highest reading falls in the Elevated range.`;
    case 'low':
      return `${base}. All readings are in the low (hypotensive) range.`;
    case 'normal':
      return `${base}. All readings within the normal range.`;
  }
}
