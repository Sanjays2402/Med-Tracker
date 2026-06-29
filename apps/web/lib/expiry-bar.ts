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

/**
 * Richer hover tooltip for one expiry-bar segment, naming its share of the
 * whole list rather than just the bucket count. The bar's segment labels read
 * "3 expiring soon"; this reads "3 of 6 shares expiring within 7 days" so a
 * hover puts the count in the context of the full share list.
 *
 * `total` is the bar's `total` (every share counted into it). `withinDays`
 * matches the soon window summarizeExpiry used (default 7) so the phrase never
 * claims a window the tally didn't use. The noun pluralises on the total, so a
 * single-share list reads "1 of 1 share". Pure; no React.
 */
export function expirySegmentTooltip(
  segment: Pick<ExpiryBarSegment, 'kind' | 'count'>,
  total: number,
  withinDays = 7,
): string {
  const noun = total === 1 ? 'share' : 'shares';
  const lead = `${segment.count} of ${total} ${noun}`;
  switch (segment.kind) {
    case 'active': return `${lead} active`;
    case 'soon': return `${lead} expiring within ${withinDays} days`;
    case 'expired': return `${lead} expired`;
  }
}

/** Spoken phrase for a single segment's share of the bar, e.g. "50% active". */
function segmentPercentPhrase(segment: ExpiryBarSegment): string {
  switch (segment.kind) {
    case 'active': return `${segment.pct}% active`;
    case 'soon': return `${segment.pct}% expiring soon`;
    case 'expired': return `${segment.pct}% expired`;
  }
}

/**
 * Screen-reader description naming each segment's PERCENTAGE of the bar, e.g.
 * "50% active, 25% expiring soon, 25% expired". The visible bar is a row of
 * coloured widths a sighted user reads at a glance; this gives an equivalent
 * spoken summary so the split is legible to assistive tech rather than just an
 * undifferentiated coloured strip.
 *
 * Only non-empty segments are named (empty buckets are already dropped from
 * `bar.segments`). The percentages are the same largest-remainder-rounded widths
 * the bar draws, so they sum to 100 and the description never disagrees with the
 * picture. Pure; no React.
 */
export function expiryBarAriaDescription(bar: ExpiryBar): string {
  return bar.segments.map(segmentPercentPhrase).join(', ');
}

/**
 * One-line "all healthy" legend for when the bar has nothing at risk (no soon /
 * expired shares). The /caregivers header hides the stacked bar entirely when
 * hasRisk is false, which leaves the header with no health read at all on a tidy
 * list; this gives it a single muted line instead.
 *
 * Returns null when the bar IS at risk (the coloured bar speaks for itself) or
 * when there are no shares counted at all (nothing to vouch for). Otherwise it
 * pluralises on the bar's total: "All 4 shares active", "The 1 share is active".
 * Pure; no React.
 */
export function allActiveLegend(bar: ExpiryBar): string | null {
  if (bar.hasRisk || bar.total <= 0) return null;
  if (bar.total === 1) return 'The 1 share is active';
  return `All ${bar.total} shares active`;
}

/**
 * Hover tooltip for the always-on health bar's single sage segment when nothing
 * is at risk: "4 of 4 shares active". The always-on bar is a one-segment muted
 * track a sighted user reads as "all good"; this names the exact share count so
 * a hover confirms it. Composes expirySegmentTooltip with the bar's total as
 * BOTH the count and the denominator (every share is active), so the noun
 * pluralises on the total ("1 of 1 share active"). Returns null when the bar IS
 * at risk (the coloured segments have their own per-segment tooltips) or there
 * are no shares. Pure; no React.
 */
export function activeBarTooltip(bar: ExpiryBar): string | null {
  if (bar.hasRisk || bar.total <= 0) return null;
  return expirySegmentTooltip({ kind: 'active', count: bar.total }, bar.total);
}

/**
 * Self-contained aria-label for a SINGLE legend chip / bar segment, pairing its
 * percentage of the bar with its share of the whole list:
 * "25% expiring soon, 1 of 4 shares". The bar's overall aria-description names
 * every segment at once (for the bar as a unit); this gives each legend chip its
 * OWN spoken label so a screen-reader user tabbing the chips hears each one in
 * context instead of an unlabelled swatch.
 *
 * Composes segmentPercentPhrase (the same largest-remainder pct the bar draws)
 * with the segment's count over `total`, so the spoken percent never disagrees
 * with the picture and the count is grounded in the full share list. The noun
 * pluralises on the total ("1 of 1 share"). Pure; no React.
 */
export function expirySegmentAriaLabel(segment: ExpiryBarSegment, total: number): string {
  const noun = total === 1 ? 'share' : 'shares';
  return `${segmentPercentPhrase(segment)}, ${segment.count} of ${total} ${noun}`;
}
