/**
 * refill-filter — pure tab model for the /refills status filter row.
 *
 * The refills page groups items by status (needed / requested / ready /
 * picked_up). This module adds a top-level filter tab row (All / Needed /
 * Requested / Ready) so a user can narrow the whole page to one status, with a
 * count badge per tab. Parallels lib/notification-filter.ts.
 *
 * The "Ready" tab absorbs both 'ready' and 'picked_up' (a picked-up refill is a
 * completed/ready outcome) so every refill lands under exactly one tab.
 */

import type { Refill } from './types';

export type RefillTab = 'all' | 'needed' | 'requested' | 'ready';

export interface RefillTabDef {
  tab: RefillTab;
  label: string;
}

export const REFILL_TABS: RefillTabDef[] = [
  { tab: 'all', label: 'All' },
  { tab: 'needed', label: 'Needed' },
  { tab: 'requested', label: 'Requested' },
  { tab: 'ready', label: 'Ready' },
];

/** Which tab a refill status belongs to. 'picked_up' folds into Ready. */
export function tabForStatus(status: Refill['status']): Exclude<RefillTab, 'all'> {
  switch (status) {
    case 'needed': return 'needed';
    case 'requested': return 'requested';
    case 'ready': return 'ready';
    case 'picked_up': return 'ready';
  }
}

/** True when a refill belongs in the given tab ('all' matches everything). */
export function matchesTab(refill: Refill, tab: RefillTab): boolean {
  if (tab === 'all') return true;
  return tabForStatus(refill.status) === tab;
}

export function filterByTab(refills: readonly Refill[], tab: RefillTab): Refill[] {
  return refills.filter((r) => matchesTab(r, tab));
}

/**
 * Per-tab counts for the whole list. Every tab in REFILL_TABS gets an entry
 * (including empty ones) so the renderer can always show a badge.
 */
export function countByTab(refills: readonly Refill[]): Record<RefillTab, number> {
  const out: Record<RefillTab, number> = { all: 0, needed: 0, requested: 0, ready: 0 };
  for (const r of refills) {
    out.all++;
    out[tabForStatus(r.status)]++;
  }
  return out;
}

/**
 * Choose the best default tab on load: prefer the most actionable non-empty
 * tab (Needed first, then Requested, then Ready); fall back to All when the
 * list is empty so the user still sees the empty state.
 */
export function defaultTab(refills: readonly Refill[]): RefillTab {
  const counts = countByTab(refills);
  if (counts.needed > 0) return 'needed';
  if (counts.requested > 0) return 'requested';
  if (counts.ready > 0) return 'ready';
  return 'all';
}
