/**
 * expiry-bar-pref — pure persistence guard for the /caregivers "show health bar"
 * toggle.
 *
 * The caregivers header stacked expiry bar only renders when something is at
 * risk (soon / expired shares); a tidy all-active list hides it and shows a
 * one-line legend instead. Users who want a consistent header read can opt to
 * always render the bar (muted, single sage segment). That choice is a per-user
 * preference that should survive a reload, exactly like the medications density
 * toggle (lib/density-pref) and the notifications unread filter
 * (lib/notification-unread-pref). This module owns the storage key, the default,
 * and the normalize/parse/serialize guards so the page stays a thin render.
 *
 * No React, no direct localStorage access here. The stored value is a boolean
 * serialised as JSON; the parser tolerates a bare token or a JSON-quoted one and
 * falls back to the default for anything else.
 */

export const EXPIRY_BAR_STORAGE_KEY = 'medtracker.caregivers.showHealthBar';
export const DEFAULT_SHOW_HEALTH_BAR = false;

/** Coerce an arbitrary stored/runtime value into a boolean show-health-bar flag. */
export function normalizeShowHealthBar(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return DEFAULT_SHOW_HEALTH_BAR;
}

/** Parse a raw localStorage string (stored as JSON). */
export function parseShowHealthBar(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return DEFAULT_SHOW_HEALTH_BAR;
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeShowHealthBar(value);
}

/** Serialise the flag for localStorage (mirrors how the other prefs store). */
export function serializeShowHealthBar(value: boolean): string {
  return JSON.stringify(value);
}
