/**
 * adherence-trend — pure "this window vs prior window" trend classifier.
 *
 * The dashboard adherence ring gets a small up / down / flat arrow plus a
 * percentage-point delta chip ("+5pp vs prior 30d"). This module owns the
 * direction classification, the signed delta, the display tone, and the label
 * so the dashboard stays a thin render and the math stays unit-tested.
 *
 * A trend is direction + magnitude derived from two adherence percentages
 * (current vs prior). Deltas inside a small dead-band read as "flat" so a 1pp
 * wobble doesn't flip the arrow every reload. Counts-based helpers short-circuit
 * to null when the prior window has no scheduled doses, so the UI shows nothing
 * rather than inventing a baseline. No React, no Date.now().
 */

export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendResult {
  direction: TrendDirection;
  /** Signed percentage-point delta (current - prior), rounded to a whole pp. */
  deltaPp: number;
  /** Absolute delta for display, rounded to a whole pp. */
  magnitude: number;
  /** Tone hint: rising adherence is good (ok), falling is danger, flat neutral. */
  tone: 'ok' | 'danger' | 'neutral';
  /** Short signed label, e.g. "+5pp", "-3pp", "no change". */
  label: string;
}

export interface TrendOptions {
  /** Deltas within +/- this many pp read as flat. Default 1. */
  flatThresholdPp?: number;
}

const DEFAULT_FLAT_PP = 1;

/** Whole-percent adherence from counts; 0 when nothing was scheduled. */
export function adherencePercent(taken: number, scheduled: number): number {
  if (!Number.isFinite(scheduled) || scheduled <= 0) return 0;
  const pct = (taken / scheduled) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

function labelFor(deltaPp: number, direction: TrendDirection): string {
  if (direction === 'flat') return 'no change';
  return `${deltaPp > 0 ? '+' : ''}${deltaPp}pp`;
}

/**
 * Classify a trend from two whole-percent values. Direction is up/down when the
 * delta clears the flat dead-band, else flat. Inputs are rounded defensively so
 * a caller passing raw floats still gets whole-pp output.
 */
export function classifyAdherenceTrend(
  currentPct: number,
  priorPct: number,
  opts: TrendOptions = {},
): TrendResult {
  const flat = Math.max(0, opts.flatThresholdPp ?? DEFAULT_FLAT_PP);
  const deltaPp = Math.round(currentPct) - Math.round(priorPct);
  const direction: TrendDirection =
    deltaPp > flat ? 'up' : deltaPp < -flat ? 'down' : 'flat';
  const tone = direction === 'up' ? 'ok' : direction === 'down' ? 'danger' : 'neutral';
  return {
    direction,
    deltaPp,
    magnitude: Math.abs(deltaPp),
    tone,
    label: labelFor(deltaPp, direction),
  };
}

/**
 * Classify a trend from raw counts. Returns null when the prior window had no
 * scheduled doses (no honest baseline to compare against), so the dashboard can
 * fall back to a plain label instead of showing a fabricated delta.
 */
export function trendFromCounts(
  currentTaken: number,
  currentScheduled: number,
  priorTaken: number,
  priorScheduled: number,
  opts: TrendOptions = {},
): TrendResult | null {
  if (!Number.isFinite(priorScheduled) || priorScheduled <= 0) return null;
  return classifyAdherenceTrend(
    adherencePercent(currentTaken, currentScheduled),
    adherencePercent(priorTaken, priorScheduled),
    opts,
  );
}
