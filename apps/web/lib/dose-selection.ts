/**
 * dose-selection — pure selection model for the Today page bulk-take feature.
 *
 * The Today page lets a user multi-select pending dose rows and mark them all
 * taken in one action. This module holds the selection math so it can be unit
 * tested without rendering React: toggling, shift-click range select, and
 * "select all pending". Selection is represented as a ReadonlySet<string> of
 * dose ids; every helper returns a NEW set (never mutates its input) so it
 * drops straight into React state.
 *
 * Only *pending* doses are selectable — a dose that is already taken / skipped /
 * missed can't be bulk-taken, so the helpers filter against the selectable set.
 */

export interface SelectableDose {
  id: string;
  status: 'pending' | 'taken' | 'skipped' | 'missed';
}

/** Ids of the doses that are eligible for bulk selection, in the given order. */
export function selectablePendingIds(doses: readonly SelectableDose[]): string[] {
  return doses.filter((d) => d.status === 'pending').map((d) => d.id);
}

/** Toggle a single id. No-op (returns an equivalent new set) if id is empty. */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected);
  if (!id) return next;
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Shift-click range select. Given the *ordered* list of selectable ids, select
 * every id between `anchorId` and `targetId` inclusive (regardless of click
 * direction) and union it onto the current selection. Ids outside the
 * selectable list are ignored. If either endpoint isn't selectable, falls back
 * to simply adding whichever endpoints ARE selectable.
 */
export function rangeSelect(
  orderedSelectableIds: readonly string[],
  anchorId: string,
  targetId: string,
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  const a = orderedSelectableIds.indexOf(anchorId);
  const b = orderedSelectableIds.indexOf(targetId);
  if (a === -1 || b === -1) {
    // One or both endpoints not selectable: add whichever is valid.
    if (a !== -1) next.add(anchorId);
    if (b !== -1) next.add(targetId);
    return next;
  }
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  for (let i = lo; i <= hi; i++) {
    const id = orderedSelectableIds[i];
    if (id) next.add(id);
  }
  return next;
}

/** Select every selectable (pending) dose. */
export function selectAllPending(doses: readonly SelectableDose[]): Set<string> {
  return new Set(selectablePendingIds(doses));
}

/** Drop any selected ids that are no longer selectable (e.g. after a refresh). */
export function pruneSelection(
  selected: ReadonlySet<string>,
  doses: readonly SelectableDose[],
): Set<string> {
  const ok = new Set(selectablePendingIds(doses));
  const next = new Set<string>();
  for (const id of selected) if (ok.has(id)) next.add(id);
  return next;
}

export interface SelectionSummary {
  /** How many doses are currently selected (after pruning to selectable). */
  count: number;
  /** Total pending doses available to select. */
  selectableCount: number;
  /** True when every selectable pending dose is selected and there's >= 1. */
  allSelected: boolean;
  /** True when nothing is selected. */
  isEmpty: boolean;
}

export function summarizeSelection(
  selected: ReadonlySet<string>,
  doses: readonly SelectableDose[],
): SelectionSummary {
  const selectable = selectablePendingIds(doses);
  const selectableSet = new Set(selectable);
  let count = 0;
  for (const id of selected) if (selectableSet.has(id)) count++;
  return {
    count,
    selectableCount: selectable.length,
    allSelected: selectable.length > 0 && count === selectable.length,
    isEmpty: count === 0,
  };
}
