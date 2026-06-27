/**
 * refill-sort-pref — pure persistence guard for the /refills sort control.
 *
 * The refills list's Default / Soonest run-out sort is a per-user preference
 * that should survive a reload, exactly like the medications density toggle
 * (lib/density-pref) and the run-out grouping flag (lib/runout-group-pref). This
 * module owns the storage key, the default, and the normalize/parse guards for
 * the stored value so the page stays a thin render and the persistence stays a
 * one-line hook.
 *
 * No React, no direct localStorage access here. The stored value is the sort
 * key serialised as JSON ('"default"' / '"runout"'); the parser tolerates a
 * bare token or a JSON-quoted one and falls back to the default for anything
 * else (including a key the app no longer offers).
 */

import type { RefillSortKey } from './refill-sort';

export const REFILL_SORT_STORAGE_KEY = 'medtracker.refills.sort';
export const DEFAULT_REFILL_SORT: RefillSortKey = 'default';

/** The keys this control accepts; anything else normalizes to the default. */
const VALID_KEYS: readonly RefillSortKey[] = ['default', 'runout'];

/** Coerce an arbitrary stored/runtime value into a valid RefillSortKey. */
export function normalizeRefillSort(value: unknown): RefillSortKey {
  return value === 'runout' || value === 'default' ? value : DEFAULT_REFILL_SORT;
}

/** Parse a raw localStorage string (safeLocalStorage stores it as JSON). */
export function parseRefillSort(raw: string | null | undefined): RefillSortKey {
  if (raw == null || raw === '') return DEFAULT_REFILL_SORT;
  // Accept both a bare token ("runout") and a JSON-quoted one ('"runout"').
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeRefillSort(value);
}

/** Serialise the key for localStorage (mirrors how density-pref stores). */
export function serializeRefillSort(value: RefillSortKey): string {
  return JSON.stringify(normalizeRefillSort(value));
}

/** True when `key` is a sort this control still offers (forward-compat guard). */
export function isKnownRefillSort(key: string): key is RefillSortKey {
  return (VALID_KEYS as readonly string[]).includes(key);
}
