/**
 * runout-group-pref — pure persistence guard for the /medications "Group by
 * run-out" toggle.
 *
 * The medications list's run-out grouping is a per-user preference that should
 * survive a reload, exactly like the row-density toggle (lib/density-pref). This
 * module owns the storage key, the default, and the normalize/parse guards for
 * the stored value so the page stays a thin render and the persistence stays a
 * one-line hook.
 *
 * No React, no direct localStorage access here. The stored value is a boolean
 * serialised as JSON ("true" / "false"); the parser tolerates a bare token or a
 * JSON-quoted one and falls back to the default for anything else.
 */

export const RUNOUT_GROUP_STORAGE_KEY = 'medtracker.medications.runoutGroup';
export const DEFAULT_RUNOUT_GROUP = false;

/** Coerce an arbitrary stored/runtime value into a boolean grouping flag. */
export function normalizeRunoutGroup(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return DEFAULT_RUNOUT_GROUP;
}

/** Parse a raw localStorage string (safeLocalStorage stores it as JSON). */
export function parseRunoutGroup(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return DEFAULT_RUNOUT_GROUP;
  // Accept both a bare token ("true") and a JSON-quoted one ('"true"' / "true").
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeRunoutGroup(value);
}

/** Serialise the flag for localStorage (mirrors how density-pref stores). */
export function serializeRunoutGroup(value: boolean): string {
  return JSON.stringify(value);
}
