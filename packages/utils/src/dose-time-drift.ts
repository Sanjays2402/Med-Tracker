/**
 * Chronic dose-time drift detector.
 *
 * Even when a patient hits 95% adherence, the wall-clock time of each
 * dose can creep over weeks — the 08:00 morning dose slowly becoming
 * a 09:30 dose. The dose still gets logged "on time" inside the +- 60
 * minute tolerance window, but the underlying schedule is wrong: a med
 * with a true 12-hour interval is now stretching to 13.5, then 14, and
 * its plasma trough is climbing into the danger zone before anyone
 * notices.
 *
 * This module looks at one medication's history and reports:
 *
 *   - driftMinutes: median (taken - due) delta in minutes, signed.
 *     Positive = taking later than scheduled.
 *   - consistency: 1 - (MAD of deltas / 60), clamped to [0, 1]. Higher
 *     means the patient is consistently shifted (real schedule mismatch);
 *     lower means random noise.
 *   - direction: 'earlier' | 'later' | 'aligned' based on driftMinutes
 *     and the configured threshold.
 *   - recommendedTimeShiftMinutes: drift rounded to nearest 5 minutes,
 *     ready for a "want to update your schedule?" prompt.
 *   - confidence: combined signal (samples + consistency) so the UI can
 *     decide whether to surface the suggestion.
 *
 * Pure / deterministic. Operates on DoseHistoryEntry so it composes
 * directly with the aggregator and the import pipeline.
 */

import type { DoseHistoryEntry } from './dose-history-aggregator';

export type DriftDirection = 'earlier' | 'later' | 'aligned' | 'insufficient';

export interface DriftOptions {
  /** Minutes of drift below which direction is "aligned". Default 30. */
  alignedThresholdMinutes?: number;
  /** Minimum number of dose samples required for a verdict. Default 10. */
  minSamples?: number;
  /**
   * Cap on the magnitude (minutes) of a single delta. Doses farther
   * than this from due are treated as noise / one-off lateness, not
   * drift, and excluded from the median fit. Default 240 (4h).
   */
  noiseClipMinutes?: number;
  /**
   * Rounding step (minutes) for the recommendation. Default 5.
   */
  shiftStepMinutes?: number;
  /**
   * Minimum consistency (MAD-based) the recommendation needs before
   * `confidence` clears 0.5. Default 0.4.
   */
  minConsistency?: number;
}

export interface DriftReport {
  /** Medication this report describes. */
  medicationId: string;
  /** Total samples considered (after filtering for takenAt + scheduled). */
  samples: number;
  /** Median signed drift in minutes (after noise clipping). */
  driftMinutes: number;
  /** Spread of deltas (MAD-based). Lower = tighter cluster. */
  driftMadMinutes: number;
  consistency: number;
  direction: DriftDirection;
  /** Rounded-to-step recommendation; 0 when 'aligned'. */
  recommendedTimeShiftMinutes: number;
  confidence: number;
  /** Plain-text rationale. */
  message: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function mad(values: number[], center: number): number {
  if (values.length === 0) return 0;
  const deviations = values.map((v) => Math.abs(v - center));
  return median(deviations);
}

function roundTo(n: number, step: number): number {
  if (step <= 0) return n;
  return Math.round(n / step) * step;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Compute the drift report for a single medication.
 *
 * Filters: entries missing `takenAt`, missing `dueAt`, or explicitly
 * `skipped` are excluded. Deltas beyond `noiseClipMinutes` are clipped
 * to that bound (so a 6-hour-late outlier still counts toward sample
 * size but doesn't dominate the median).
 */
export function computeDoseTimeDrift(
  medicationId: string,
  entries: DoseHistoryEntry[],
  options: DriftOptions = {},
): DriftReport {
  const alignedThreshold = options.alignedThresholdMinutes ?? 30;
  const minSamples = options.minSamples ?? 10;
  const noiseClip = options.noiseClipMinutes ?? 240;
  const step = options.shiftStepMinutes ?? 5;
  const minConsistency = options.minConsistency ?? 0.4;

  const relevant = entries.filter((e) => {
    if (e.medicationId !== undefined && e.medicationId !== medicationId) return false;
    if (e.skipped) return false;
    if (!e.takenAt) return false;
    if (!e.dueAt) return false;
    return true;
  });

  const deltas: number[] = [];
  for (const e of relevant) {
    const due = new Date(e.dueAt).getTime();
    const taken = new Date(e.takenAt!).getTime();
    if (!Number.isFinite(due) || !Number.isFinite(taken)) continue;
    let mins = (taken - due) / 60_000;
    if (mins > noiseClip) mins = noiseClip;
    if (mins < -noiseClip) mins = -noiseClip;
    deltas.push(mins);
  }

  if (deltas.length < minSamples) {
    return {
      medicationId,
      samples: deltas.length,
      driftMinutes: 0,
      driftMadMinutes: 0,
      consistency: 0,
      direction: 'insufficient',
      recommendedTimeShiftMinutes: 0,
      confidence: 0,
      message: `Need at least ${minSamples} logged doses to evaluate drift; have ${deltas.length}.`,
    };
  }

  const med = median(deltas);
  const madVal = mad(deltas, med);
  // Consistency: tighter clusters (MAD < 60 min) score higher.
  const consistency = clamp01(1 - madVal / 60);

  let direction: DriftDirection = 'aligned';
  if (med > alignedThreshold) direction = 'later';
  else if (med < -alignedThreshold) direction = 'earlier';

  const shift = direction === 'aligned' ? 0 : roundTo(med, step);

  // Confidence: blend sample count (caps at 2x minSamples) and consistency.
  const sampleScore = clamp01(deltas.length / (minSamples * 2));
  const consistencyScore = consistency < minConsistency ? consistency * 0.5 : consistency;
  const confidence = clamp01(sampleScore * 0.5 + consistencyScore * 0.5);

  const message = buildMessage(direction, med, shift, deltas.length);

  return {
    medicationId,
    samples: deltas.length,
    driftMinutes: Math.round(med * 10) / 10,
    driftMadMinutes: Math.round(madVal * 10) / 10,
    consistency: Math.round(consistency * 1000) / 1000,
    direction,
    recommendedTimeShiftMinutes: shift,
    confidence: Math.round(confidence * 1000) / 1000,
    message,
  };
}

function buildMessage(
  direction: DriftDirection,
  driftMinutes: number,
  shift: number,
  samples: number,
): string {
  if (direction === 'insufficient') {
    return `Drift unknown; only ${samples} samples.`;
  }
  if (direction === 'aligned') {
    return `Doses arrive within tolerance (median ${Math.round(driftMinutes)} min from scheduled).`;
  }
  const dir = direction === 'later' ? 'later than' : 'earlier than';
  const absShift = Math.abs(shift);
  return `Doses consistently ${dir} scheduled by ~${Math.abs(Math.round(driftMinutes))} min; consider shifting schedule by ${shift > 0 ? '+' : ''}${shift} min (suggested step: ${absShift} min).`;
}

/**
 * Run the drift report over every medication present in the history.
 * Returns one report per distinct medicationId.
 */
export function computeAllDoseTimeDrifts(
  entries: DoseHistoryEntry[],
  options: DriftOptions = {},
): DriftReport[] {
  const byMed = new Map<string, DoseHistoryEntry[]>();
  for (const e of entries) {
    if (!e.medicationId) continue;
    const arr = byMed.get(e.medicationId) ?? [];
    arr.push(e);
    byMed.set(e.medicationId, arr);
  }
  const reports: DriftReport[] = [];
  for (const [medicationId, list] of byMed) {
    reports.push(computeDoseTimeDrift(medicationId, list, options));
  }
  // Order by confidence desc so the UI surfaces actionable rows first.
  reports.sort((a, b) => b.confidence - a.confidence || a.medicationId.localeCompare(b.medicationId));
  return reports;
}
