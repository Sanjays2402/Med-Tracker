/**
 * med-sort-caption — pure caption phrasing for the /medications sort control.
 *
 * The medications list persists its Name / Lowest supply / Soonest refill sort
 * (lib/med-sort-pref) and toggles a run-out grouping mode. The active ordering
 * is legible from the pressed chip, but a small "sorted by ..." caption under
 * the controls makes it unambiguous at a glance — especially once a search has
 * narrowed the list and the user is wondering why a particular med is on top.
 *
 * This module owns the human phrasing for each sort key (and the grouped mode)
 * so the page stays a thin render and the copy stays unit-tested. No React.
 */

import type { MedSortKey } from './medication-sort';

/** The natural-language phrase for each sort key, used inside "Sorted by ...". */
const SORT_PHRASE: Record<MedSortKey, string> = {
  name: 'name, A to Z',
  supply: 'lowest supply first',
  runout: 'soonest run-out first',
};

/**
 * The bare ordering phrase for a sort key ("lowest supply first"). Falls back to
 * the name phrasing for an unknown key so the caption is never blank.
 */
export function medSortPhrase(key: MedSortKey): string {
  return SORT_PHRASE[key] ?? SORT_PHRASE.name;
}

/**
 * Full caption line for the active sort. When run-out grouping is on, the list
 * is bucketed by urgency rather than flat-sorted, so the caption reflects that
 * instead of the underlying key:
 *   - grouped            -> "Grouped by run-out urgency"
 *   - name               -> "Sorted by name, A to Z"
 *   - supply             -> "Sorted by lowest supply first"
 *   - runout             -> "Sorted by soonest run-out first"
 */
export function medSortCaption(key: MedSortKey, grouped = false): string {
  if (grouped) return 'Grouped by run-out urgency';
  return `Sorted by ${medSortPhrase(key)}`;
}

/**
 * Optional trailing match-count clause for when a search is filtering the list,
 * e.g. " · 4 of 12 shown". Returns an empty string when nothing is filtered
 * (no query, or every med matches) so the caller can append unconditionally.
 */
export function medSortMatchClause(total: number, shown: number, filtering: boolean): string {
  if (!filtering) return '';
  if (!Number.isFinite(total) || !Number.isFinite(shown)) return '';
  if (shown >= total) return '';
  return ` · ${Math.max(0, shown)} of ${Math.max(0, total)} shown`;
}
