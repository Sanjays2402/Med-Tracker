/**
 * adherence-breakdown — pure derivation of a taken / skipped / missed split
 * from an AdherenceSummary for the dashboard adherence-ring detail popover.
 *
 * The AdherenceSummary the API hands the dashboard carries `taken` and
 * `scheduled` over a window but not an explicit skipped-vs-missed split. The
 * popover wants to show all three. This module derives a deterministic,
 * conservative split: every not-taken dose is "missed" unless a skipped count
 * is supplied, in which case the remainder are missed. It also computes the
 * percentages and the arc segments (start/sweep fractions) so the popover can
 * draw a stacked mini-bar without doing any math in the component.
 *
 * No React, no Date.now — fully deterministic for tests.
 */

export interface AdherenceBreakdownInput {
  taken: number;
  scheduled: number;
  /** Optional explicit skipped count; clamped into [0, scheduled - taken]. */
  skipped?: number;
}

export interface BreakdownSegment {
  kind: 'taken' | 'skipped' | 'missed';
  count: number;
  /** Share of the scheduled total, 0..1. */
  fraction: number;
  /** Rounded 0..100 percent (largest-remainder so the three sum to 100). */
  percent: number;
}

export interface AdherenceBreakdown {
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
  /** Adherence percent = round(taken / scheduled * 100). */
  adherencePct: number;
  /** taken, skipped, missed segments in render order. */
  segments: BreakdownSegment[];
}

export function computeBreakdown(input: AdherenceBreakdownInput): AdherenceBreakdown {
  const scheduled = Math.max(0, Math.floor(safe(input.scheduled)));
  const taken = clampInt(input.taken, 0, scheduled);
  const notTaken = scheduled - taken;
  const skipped = clampInt(input.skipped ?? 0, 0, notTaken);
  const missed = notTaken - skipped;

  const fracOf = (n: number) => (scheduled > 0 ? n / scheduled : 0);

  // Largest-remainder rounding so taken/skipped/missed percentages sum to 100
  // exactly (avoids "33% + 33% + 33% = 99%" gaps in the popover).
  const counts = [taken, skipped, missed];
  const percents = largestRemainderPercents(counts, scheduled);

  const kinds: Array<BreakdownSegment['kind']> = ['taken', 'skipped', 'missed'];
  const segments: BreakdownSegment[] = kinds.map((kind, i) => ({
    kind,
    count: counts[i]!,
    fraction: fracOf(counts[i]!),
    percent: percents[i]!,
  }));

  return {
    scheduled,
    taken,
    skipped,
    missed,
    adherencePct: scheduled > 0 ? Math.round((taken / scheduled) * 100) : 0,
    segments,
  };
}

/** Distribute 100 across counts proportionally using the largest-remainder method. */
function largestRemainderPercents(counts: number[], total: number): number[] {
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const floor = exact.map((x) => Math.floor(x));
  let remainder = 100 - floor.reduce((a, b) => a + b, 0);
  // Hand out the leftover points to the largest fractional parts first.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floor];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] = out[i]! + 1;
    remainder--;
  }
  return out;
}

function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.floor(safe(n));
  return Math.max(lo, Math.min(hi, v));
}

function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}
