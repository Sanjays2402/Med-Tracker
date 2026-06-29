/**
 * expiry-bar-percent-pref — pure persistence guard for the /caregivers at-risk
 * bar "show percents" toggle.
 *
 * The at-risk expiry bar's legend chips name "3 expiring soon · 2"; users who
 * want the share-of-the-bar number too can opt to surface the largest-remainder
 * percent inline ("· 50%") on each chip. That choice is a per-user preference
 * that should survive a reload, exactly like the "show health bar" toggle
 * (lib/expiry-bar-pref) and the notifications unread filter
 * (lib/notification-unread-pref). This module owns the storage key, the default,
 * and the normalize/parse/serialize guards so the page stays a thin render.
 *
 * No React, no direct localStorage access here. The stored value is a boolean
 * serialised as JSON; the parser tolerates a bare token or a JSON-quoted one and
 * falls back to the default for anything else.
 */

export const EXPIRY_BAR_PCT_STORAGE_KEY = 'medtracker.caregivers.showBarPercents';
export const DEFAULT_SHOW_BAR_PERCENTS = false;

/** Coerce an arbitrary stored/runtime value into a boolean show-percents flag. */
export function normalizeShowBarPercents(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return DEFAULT_SHOW_BAR_PERCENTS;
}

/** Parse a raw localStorage string (stored as JSON). */
export function parseShowBarPercents(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return DEFAULT_SHOW_BAR_PERCENTS;
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeShowBarPercents(value);
}

/** Serialise the flag for localStorage (mirrors how the other prefs store). */
export function serializeShowBarPercents(value: boolean): string {
  return JSON.stringify(value);
}
