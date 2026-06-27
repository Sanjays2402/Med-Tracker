/**
 * caregiver-sort — pure sort model for the /caregivers list page.
 *
 * The caregivers list gets a sort control: most-recently-viewed first,
 * least-recently-viewed first, never-viewed-first (the shares a user most likely
 * wants to chase down), or expiring-soonest (shares about to lapse, so a user
 * can renew them before access is lost). This module owns the comparators so the
 * page stays a thin render and the ordering stays unit-tested.
 *
 * "Recency" is derived from the share's lastViewedAt vs an injectable `now`
 * (reusing the caregiver-activity daysSinceViewed notion), and "expiry" from
 * daysUntilExpiry (caregiver-expiry), so the comparators are deterministic. A
 * never-viewed / no-expiry share has no recency / expiry; where it sorts depends
 * on the chosen key, never on chance.
 */

import type { CaregiverShare } from './types';
import { daysUntilExpiry } from './caregiver-expiry';

export type CaregiverSortKey = 'recent' | 'stale' | 'never-first' | 'expiry';

export interface CaregiverSortOption {
  key: CaregiverSortKey;
  label: string;
}

export const CAREGIVER_SORTS: CaregiverSortOption[] = [
  { key: 'recent', label: 'Recently viewed' },
  { key: 'stale', label: 'Least recent' },
  { key: 'never-first', label: 'Never viewed' },
  { key: 'expiry', label: 'Expiring soonest' },
];

/** Epoch ms a share was last viewed, or null when never viewed / unparseable. */
export function lastViewedAt(share: Pick<CaregiverShare, 'lastViewedAt'>): number | null {
  if (!share.lastViewedAt) return null;
  const t = Date.parse(share.lastViewedAt);
  return Number.isFinite(t) ? t : null;
}

/**
 * Whole days since a share was last viewed relative to `now`, or null when it
 * was never viewed. Clamped at 0 so a clock skew can't read negative.
 */
export function daysSinceViewed(
  share: Pick<CaregiverShare, 'lastViewedAt'>,
  now: number = Date.now(),
): number | null {
  const t = lastViewedAt(share);
  if (t == null) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Case-insensitive label tiebreak so equal-recency shares order stably. */
function byLabel(a: CaregiverShare, b: CaregiverShare): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
}

/**
 * Sort a COPY of the shares by the chosen key.
 *
 * - 'recent': most-recently-viewed first; never-viewed sink to the bottom.
 * - 'stale':  least-recently-viewed (oldest view) first; never-viewed sink to
 *   the bottom (they have no view to be stale).
 * - 'never-first': never-viewed float to the TOP (the shares to chase), then
 *   the rest by most-recently-viewed.
 *
 * Every comparator falls back to label A-Z so ties are deterministic.
 */
export function sortCaregivers(
  shares: readonly CaregiverShare[],
  by: CaregiverSortKey,
  now: number = Date.now(),
): CaregiverShare[] {
  const out = [...shares];

  switch (by) {
    case 'recent':
      out.sort((a, b) => {
        const ta = lastViewedAt(a);
        const tb = lastViewedAt(b);
        if (ta == null && tb == null) return byLabel(a, b);
        if (ta == null) return 1; // never-viewed last
        if (tb == null) return -1;
        return tb - ta || byLabel(a, b); // newer first
      });
      break;
    case 'stale':
      out.sort((a, b) => {
        const ta = lastViewedAt(a);
        const tb = lastViewedAt(b);
        if (ta == null && tb == null) return byLabel(a, b);
        if (ta == null) return 1; // never-viewed last
        if (tb == null) return -1;
        return ta - tb || byLabel(a, b); // older first
      });
      break;
    case 'never-first':
      out.sort((a, b) => {
        const ta = lastViewedAt(a);
        const tb = lastViewedAt(b);
        if (ta == null && tb == null) return byLabel(a, b);
        if (ta == null) return -1; // never-viewed first
        if (tb == null) return 1;
        return tb - ta || byLabel(a, b); // then newest-viewed
      });
      break;
    case 'expiry':
      out.sort((a, b) => {
        // Soonest expiry first: already-expired (negative days) float to the
        // top, then nearest-future, then shares with no expiry, then label A-Z.
        const da = daysUntilExpiry(a, now);
        const db = daysUntilExpiry(b, now);
        if (da == null && db == null) return byLabel(a, b);
        if (da == null) return 1; // no-expiry shares sink to the bottom
        if (db == null) return -1;
        return da - db || byLabel(a, b);
      });
      break;
  }

  return out;
}

export interface CaregiverSortSummary {
  shares: CaregiverShare[];
  /** How many shares have never been opened. */
  neverViewedCount: number;
  /** How many shares have been opened at least once. */
  viewedCount: number;
}

/**
 * Sort plus a small headline summary the list header can show
 * ("3 never opened"). One call gives the page the ordered list and the counts.
 */
export function summarizeCaregiverSort(
  shares: readonly CaregiverShare[],
  by: CaregiverSortKey,
  now: number = Date.now(),
): CaregiverSortSummary {
  const sorted = sortCaregivers(shares, by, now);
  let neverViewedCount = 0;
  for (const s of shares) if (lastViewedAt(s) == null) neverViewedCount++;
  return {
    shares: sorted,
    neverViewedCount,
    viewedCount: shares.length - neverViewedCount,
  };
}
