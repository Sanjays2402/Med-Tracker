/**
 * caregiver-sort-caption — pure caption phrasing for the /caregivers sort control.
 *
 * The caregivers list offers a sort control (Recently viewed / Least recent /
 * Never viewed / Expiring soonest). The pressed chip shows which is active, but
 * a small "Sorted by ..." caption under the controls makes the ordering
 * unambiguous at a glance — and, like the medications caption, can fold in a
 * search match-count when a query is narrowing the list.
 *
 * This module owns the human phrasing for each CaregiverSortKey so the page
 * stays a thin render and the copy stays unit-tested. Parallels med-sort-caption.
 * No React.
 */

import type { CaregiverSortKey } from './caregiver-sort';

/** The natural-language phrase for each sort key, used inside "Sorted by ...". */
const SORT_PHRASE: Record<CaregiverSortKey, string> = {
  recent: 'most recently viewed',
  stale: 'least recently viewed',
  'never-first': 'never opened first',
  expiry: 'expiring soonest',
};

/**
 * The bare ordering phrase for a sort key ("expiring soonest"). Falls back to
 * the recent phrasing for an unknown key so the caption is never blank.
 */
export function caregiverSortPhrase(key: CaregiverSortKey): string {
  return SORT_PHRASE[key] ?? SORT_PHRASE.recent;
}

/** Full caption line for the active sort ("Sorted by expiring soonest"). */
export function caregiverSortCaption(key: CaregiverSortKey): string {
  return `Sorted by ${caregiverSortPhrase(key)}`;
}

/**
 * Optional trailing match-count clause for when a search is filtering the list,
 * e.g. " · 2 of 5 shown". Returns an empty string when nothing is filtered (no
 * query, or every share matches) so the caller can append unconditionally.
 * Mirrors medSortMatchClause exactly so the two captions read identically.
 */
export function caregiverSortMatchClause(total: number, shown: number, filtering: boolean): string {
  if (!filtering) return '';
  if (!Number.isFinite(total) || !Number.isFinite(shown)) return '';
  if (shown >= total) return '';
  return ` · ${Math.max(0, shown)} of ${Math.max(0, total)} shown`;
}
