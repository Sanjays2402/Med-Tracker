/**
 * expiry-bar — pure stacked-bar segment model for the /caregivers header.
 *
 * The caregivers header already shows an "N expiring soon" tally (expiringHeadline).
 * This module turns the same ExpirySummary into a thin stacked bar that splits
 * the shares into active / expiring-soon / expired (and any no-expiry shares fold
 * into the active-and-fine bucket), so a glance reads the health of the whole
 * share list, not just the soon count.
 *
 * Segment widths are whole-percent and sum to EXACTLY 100 via largest-remainder
 * rounding (so the bar never leaves a sliver of background or overflows). Zero
 * counts produce zero-width segments the renderer drops. Tones map onto the same
 * vocabulary the row pills use: active -> ok (sage), soon -> warn (amber),
 * expired -> danger (coral). No React; deterministic.
 */

import type { ExpirySummary } from './caregiver-expiry';

export type ExpiryBarKind = 'active' | 'soon' | 'expired';

export interface ExpiryBarSegment {
  kind: ExpiryBarKind;
  /** Shares in this segment. */
  count: number;
  /** Whole-percent width; the three widths sum to exactly 100. */
  pct: number;
  /** Tone the renderer maps to a fill colour / CSS variable. */
  tone: 'ok' | 'warn' | 'danger';
  /** Short legend label, e.g. "3 active", "1 expiring soon", "2 expired". */
  label: string;
}

export interface ExpiryBar {
  /** Segments in display order (active, soon, expired). Empty buckets are dropped. */
  segments: ExpiryBarSegment[];
  /** Shares counted into the bar (active + no-expiry + soon + expired). */
  total: number;
  /** True when there is something distinctive to show (>=1 soon or expired). */
  hasRisk: boolean;
}

const ORDER: ExpiryBarKind[] = ['active', 'soon', 'expired'];

const TONE: Record<ExpiryBarKind, 'ok' | 'warn' | 'danger'> = {
  active: 'ok',
  soon: 'warn',
  expired: 'danger',
};

/** Per-segment legend label with correct pluralisation. */
function labelFor(kind: ExpiryBarKind, count: number): string {
  switch (kind) {
    case 'active': return `${count} active`;
    case 'soon': return `${count} expiring soon`;
    case 'expired': return count === 1 ? '1 expired' : `${count} expired`;
  }
}

/**
 * Whole-percent split of the counts that sums to exactly `scale` (default 100),
 * using the largest-remainder method: floor every share, then hand the leftover
 * units to the buckets with the largest fractional parts. A bucket with a
 * non-zero count never rounds to 0 unless it genuinely loses every leftover and
 * its floor was 0 — but because every non-empty bucket gets at least its floor,
 * tiny buckets can still read 0%; the renderer keeps them visible via a min
 * width if it chooses. Pure integer arithmetic, deterministic tie-breaking by
 * input order.
 */
function largestRemainder(counts: number[], total: number, scale = 100): number[] {
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * scale);
  const floors = exact.map((x) => Math.floor(x));
  let used = floors.reduce((a, b) => a + b, 0);
  let leftover = scale - used;
  // Indices ordered by descending fractional part, stable by original index.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  const out = [...floors];
  for (let k = 0; leftover > 0 && k < order.length; k++, leftover--) {
    out[order[k]!.i]! += 1;
  }
  return out;
}

/**
 * Build the stacked-bar model from an ExpirySummary. The bar counts active +
 * no-expiry shares as the healthy "active" segment, soon as warn, expired as
 * danger. Returns null when there are no shares at all (nothing to draw).
 *
 * Widths are largest-remainder rounded so the visible segments tile to exactly
 * 100%. Empty buckets are dropped from `segments` (no zero-width slivers), but
 * their width is still distributed correctly across the survivors.
 */
export function expiryBar(summary: ExpirySummary): ExpiryBar | null {
  const counts: Record<ExpiryBarKind, number> = {
    active: summary.active + summary.noExpiry,
    soon: summary.soon,
    expired: summary.expired,
  };
  const total = counts.active + counts.soon + counts.expired;
  if (total <= 0) return null;

  const widths = largestRemainder(ORDER.map((k) => counts[k]), total);

  const segments: ExpiryBarSegment[] = ORDER.map((kind, idx) => ({
    kind,
    count: counts[kind],
    pct: widths[idx]!,
    tone: TONE[kind],
    label: labelFor(kind, counts[kind]),
  })).filter((seg) => seg.count > 0);

  return {
    segments,
    total,
    hasRisk: counts.soon > 0 || counts.expired > 0,
  };
}
