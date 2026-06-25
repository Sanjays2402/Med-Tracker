/**
 * medication-sort — pure search + sort model for the /medications list.
 *
 * The medications list gets an inline search box plus a sort control
 * (Name / Lowest supply / Soonest refill). This module holds the filter
 * predicate, the dose-frequency parser, the run-out estimate, and the sort
 * comparators so the page stays a thin render and the math stays unit-tested.
 *
 * No React, no Date.now() in the comparators — "soonest refill" is derived from
 * the medication's own remainingDoses + schedule, which is deterministic.
 */

import type { Medication } from './types';

export type MedSortKey = 'name' | 'supply' | 'runout';

export interface MedSortOption {
  key: MedSortKey;
  label: string;
}

export const MED_SORTS: MedSortOption[] = [
  { key: 'name', label: 'Name' },
  { key: 'supply', label: 'Lowest supply' },
  { key: 'runout', label: 'Soonest refill' },
];

/**
 * Count distinct dose times per day from a free-text schedule string such as
 * "08:00, 20:00 daily" (=2) or "22:00 daily" (=1). Falls back to 1 when no
 * time tokens are present so a med without a parsed schedule still projects a
 * sane (if conservative) burndown. Duplicate times collapse to one.
 */
export function dosesPerDay(schedule?: string): number {
  if (!schedule) return 1;
  const matches = schedule.match(/\b\d{1,2}:\d{2}\b/g);
  if (!matches || matches.length === 0) return 1;
  return new Set(matches).size;
}

/**
 * Estimated days of supply left = floor(remainingDoses / dosesPerDay).
 * Returns null when remainingDoses is unknown so the caller can sort those last.
 */
export function estimatedDaysLeft(med: Medication): number | null {
  if (typeof med.remainingDoses !== 'number' || !Number.isFinite(med.remainingDoses)) {
    return null;
  }
  const perDay = dosesPerDay(med.schedule);
  return Math.floor(med.remainingDoses / Math.max(1, perDay));
}

/** Case-insensitive match against name, strength, and form. */
export function matchesQuery(med: Medication, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    med.name.toLowerCase().includes(q) ||
    (med.strength ?? '').toLowerCase().includes(q) ||
    (med.form ?? '').toLowerCase().includes(q)
  );
}

export function filterMedications(meds: readonly Medication[], query: string): Medication[] {
  return meds.filter((m) => matchesQuery(m, query));
}

/**
 * Sort a COPY of the list by the chosen key. All comparators are stable on ties
 * (fall back to name A-Z) and push "unknown" values to the end so a med with no
 * supply data never floats to the top of a "lowest supply" view.
 */
export function sortMedications(meds: readonly Medication[], by: MedSortKey): Medication[] {
  const out = [...meds];
  const byName = (a: Medication, b: Medication) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  switch (by) {
    case 'name':
      out.sort(byName);
      break;
    case 'supply':
      // `|| byName` (not `??`): nullsLast returns 0 on ties, which is falsy, so
      // the name tiebreak fires; a non-zero comparison is truthy and wins.
      out.sort((a, b) => nullsLast(a.remainingDoses, b.remainingDoses) || byName(a, b));
      break;
    case 'runout':
      out.sort((a, b) => nullsLast(estimatedDaysLeft(a), estimatedDaysLeft(b)) || byName(a, b));
      break;
  }
  return out;
}

/**
 * Ascending comparator that sorts null/undefined to the end. Returns 0 when the
 * two values are equal so the caller can fall through to a tiebreak (the caller
 * uses `|| byName` — 0 is falsy, so equal values still order deterministically).
 */
function nullsLast(a: number | null | undefined, b: number | null | undefined): number {
  const an = a == null || !Number.isFinite(a);
  const bn = b == null || !Number.isFinite(b);
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (a === b) return 0;
  return (a as number) - (b as number);
}
