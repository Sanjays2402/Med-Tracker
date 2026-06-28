/**
 * notification-unread-pref — pure persistence guard for the /notifications
 * "Unread only" toggle.
 *
 * The notifications inbox's unread-only filter is a per-user preference that
 * should survive a reload, exactly like the medications run-out grouping
 * (lib/runout-group-pref) and the row-density toggle (lib/density-pref). This
 * module owns the storage key, the default, and the normalize/parse guards for
 * the stored value so the page stays a thin render and the persistence stays a
 * one-line hook.
 *
 * No React, no direct localStorage access here. The stored value is a boolean
 * serialised as JSON ("true" / "false"); the parser tolerates a bare token or a
 * JSON-quoted one and falls back to the default for anything else.
 */

export const NOTIFICATION_UNREAD_STORAGE_KEY = 'medtracker.notifications.unreadOnly';
export const DEFAULT_NOTIFICATION_UNREAD = false;

/** Coerce an arbitrary stored/runtime value into a boolean unread-only flag. */
export function normalizeUnreadOnly(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return DEFAULT_NOTIFICATION_UNREAD;
}

/** Parse a raw localStorage string (stored as JSON). */
export function parseUnreadOnly(raw: string | null | undefined): boolean {
  if (raw == null || raw === '') return DEFAULT_NOTIFICATION_UNREAD;
  // Accept both a bare token ("true") and a JSON-quoted one ('"true"' / "true").
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeUnreadOnly(value);
}

/** Serialise the flag for localStorage (mirrors how the other prefs store). */
export function serializeUnreadOnly(value: boolean): string {
  return JSON.stringify(value);
}
