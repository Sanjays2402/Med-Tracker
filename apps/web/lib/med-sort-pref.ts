/**
 * med-sort-pref — pure persistence guard for the /medications sort control.
 *
 * The medications list's Name / Lowest supply / Soonest refill sort is a
 * per-user preference that should survive a reload, exactly like the density
 * toggle (lib/density-pref), the run-out grouping flag (lib/runout-group-pref),
 * and the refills sort (lib/refill-sort-pref). This module owns the storage key,
 * the default, and the normalize/parse/serialize guards for the stored value so
 * the page stays a thin render and the persistence stays a one-line hook.
 *
 * No React, no direct localStorage access here. The stored value is the sort key
 * serialised as JSON ('"name"' / '"supply"' / '"runout"'); the parser tolerates
 * a bare token or a JSON-quoted one and falls back to the default for anything
 * else (including a key the app no longer offers).
 */

import type { MedSortKey } from './medication-sort';

export const MED_SORT_STORAGE_KEY = 'medtracker.medications.sort';
export const DEFAULT_MED_SORT: MedSortKey = 'name';

/** The keys this control accepts; anything else normalizes to the default. */
const VALID_KEYS: readonly MedSortKey[] = ['name', 'supply', 'runout'];

/** Coerce an arbitrary stored/runtime value into a valid MedSortKey. */
export function normalizeMedSort(value: unknown): MedSortKey {
  return value === 'name' || value === 'supply' || value === 'runout'
    ? value
    : DEFAULT_MED_SORT;
}

/** Parse a raw localStorage string (safeLocalStorage stores it as JSON). */
export function parseMedSort(raw: string | null | undefined): MedSortKey {
  if (raw == null || raw === '') return DEFAULT_MED_SORT;
  // Accept both a bare token ("supply") and a JSON-quoted one ('"supply"').
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeMedSort(value);
}

/** Serialise the key for localStorage (mirrors how the other prefs store). */
export function serializeMedSort(value: MedSortKey): string {
  return JSON.stringify(normalizeMedSort(value));
}

/** True when `key` is a sort this control still offers (forward-compat guard). */
export function isKnownMedSort(key: string): key is MedSortKey {
  return (VALID_KEYS as readonly string[]).includes(key);
}
