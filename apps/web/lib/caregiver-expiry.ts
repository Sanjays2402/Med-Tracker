/**
 * caregiver-expiry — pure expiry-pill status model for the /caregivers list.
 *
 * The caregivers list shows one row per share. This module turns a share's
 * `expiresAt` into a single, render-ready pill: status (none / active /
 * expiring-soon / expired), a compact label ("Expires in 3d", "Expires today",
 * "Expired"), and a tone the row maps to a pill colour. It composes the existing
 * isExpired / isExpiringSoon / relativeTime helpers so the list and the detail
 * page agree on what "soon" means.
 *
 * "Soon" is the same 7-day window isExpiringSoon uses by default. A share with
 * no expiry returns the `none` status (the row renders its plain Active pill).
 * No React; `now` is injectable so it is deterministic under test.
 */

import type { CaregiverShare } from './types';
import { isExpired, isExpiringSoon, relativeTime } from './caregiver-activity';

const DAY = 86_400_000;

export type ExpiryStatus = 'none' | 'active' | 'soon' | 'expired';

export interface ExpiryPill {
  status: ExpiryStatus;
  /** Tone the row maps to a Pill colour. `none`/`active` are ok, soon warn, expired danger. */
  tone: 'ok' | 'warn' | 'danger';
  /** Compact pill label, or null when there's nothing distinctive to show (none/active). */
  label: string | null;
  /**
   * Whole days until expiry (negative when past, null when no expiry / unparseable).
   * Ceil so "later today" reads 0 and tomorrow reads 1, matching the refills chip.
   */
  daysUntil: number | null;
}

/**
 * Whole days from `now` until the share's expiry. Null when there is no expiry
 * or the date is unparseable. Negative once expired. Uses ceil so a same-day
 * future expiry reads 0 (today) and tomorrow reads 1.
 */
export function daysUntilExpiry(
  share: Pick<CaregiverShare, 'expiresAt'>,
  now: number = Date.now(),
): number | null {
  if (!share.expiresAt) return null;
  const t = Date.parse(share.expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / DAY);
}

/** Compact label for a soon-to-expire share: "Expires today/tomorrow/in Nd". */
function soonLabel(days: number | null): string {
  if (days == null) return 'Expires soon';
  if (days <= 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days}d`;
}

/**
 * Build the expiry pill model for a share. Order of checks: a share with no
 * expiry is `none`; an already-past expiry is `expired`; one inside the soon
 * window is `soon` with a day-count label; everything else is `active` with no
 * distinctive label (the row shows its plain Active pill).
 *
 * `withinMs` is forwarded to isExpiringSoon so a caller can widen / narrow the
 * "soon" window if it ever needs to.
 */
export function expiryPill(
  share: Pick<CaregiverShare, 'expiresAt'>,
  now: number = Date.now(),
  withinMs: number = 7 * DAY,
): ExpiryPill {
  const daysUntil = daysUntilExpiry(share, now);
  if (!share.expiresAt || daysUntil == null) {
    return { status: 'none', tone: 'ok', label: null, daysUntil: null };
  }
  if (isExpired(share, now)) {
    return { status: 'expired', tone: 'danger', label: 'Expired', daysUntil };
  }
  if (isExpiringSoon(share, now, withinMs)) {
    return { status: 'soon', tone: 'warn', label: soonLabel(daysUntil), daysUntil };
  }
  return { status: 'active', tone: 'ok', label: null, daysUntil };
}

/**
 * Longer relative phrasing for a tooltip ("in 3 days", "5 days ago"), delegating
 * to relativeTime. Null when the share has no expiry.
 */
export function expiryTooltip(
  share: Pick<CaregiverShare, 'expiresAt'>,
  now: number = Date.now(),
): string | null {
  if (!share.expiresAt) return null;
  if (!Number.isFinite(Date.parse(share.expiresAt))) return null;
  return `${isExpired(share, now) ? 'Expired' : 'Expires'} ${relativeTime(share.expiresAt, now)}`;
}
