/**
 * caregiver-activity — pure relative-time + activity-feed model for a share.
 *
 * The caregiver detail page gets an activity feed: when the share was created,
 * when it was last viewed, and when it expires - each with a friendly relative
 * timestamp ("2 days ago", "in 3 weeks"). This module turns a CaregiverShare
 * into an ordered list of activity events plus scope-badge metadata, with all
 * "now" handling injectable so it is fully deterministic under test.
 *
 * No React. The reference `now` defaults to Date.now() but every function takes
 * it as a parameter so tests pin a fixed clock.
 */

import type { CaregiverShare } from './types';

export type ActivityKind = 'created' | 'viewed' | 'never-viewed' | 'expires' | 'expired';

export interface ActivityEvent {
  kind: ActivityKind;
  /** ISO timestamp the event refers to, or null for the never-viewed marker. */
  at: string | null;
  /** Short label, e.g. "Created", "Last viewed", "Expires". */
  label: string;
  /** Relative phrasing, e.g. "2 days ago", "in 3 weeks", "never". */
  relative: string;
  /** Tone hint for the UI dot. */
  tone: 'neutral' | 'ok' | 'warn' | 'danger';
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Round-half-up division used for whole-unit relative phrasing. */
function units(ms: number, per: number): number {
  return Math.max(1, Math.round(ms / per));
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/**
 * Friendly relative phrasing for an instant vs `now`. Past reads "... ago",
 * future reads "in ...". Anything under ~45s collapses to "just now".
 */
export function relativeTime(at: string | number | Date, now: number = Date.now()): string {
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(t)) return 'unknown';
  const diff = t - now; // positive = future
  const abs = Math.abs(diff);
  if (abs < 45 * 1000) return 'just now';

  const [n, unit] =
    abs < HOUR ? [units(abs, MIN), 'minute'] as const :
    abs < DAY ? [units(abs, HOUR), 'hour'] as const :
    abs < WEEK ? [units(abs, DAY), 'day'] as const :
    abs < MONTH ? [units(abs, WEEK), 'week'] as const :
    abs < YEAR ? [units(abs, MONTH), 'month'] as const :
    [units(abs, YEAR), 'year'] as const;

  const phrase = plural(n, unit);
  return diff < 0 ? `${phrase} ago` : `in ${phrase}`;
}

/** True when the share's expiry is in the past relative to `now`. */
export function isExpired(share: Pick<CaregiverShare, 'expiresAt'>, now: number = Date.now()): boolean {
  if (!share.expiresAt) return false;
  const t = Date.parse(share.expiresAt);
  return Number.isFinite(t) && t < now;
}

/**
 * True when the share expires within `withinMs` (default 7 days) of now and has
 * not already expired - the window where the UI should warn "expiring soon".
 */
export function isExpiringSoon(
  share: Pick<CaregiverShare, 'expiresAt'>,
  now: number = Date.now(),
  withinMs: number = WEEK,
): boolean {
  if (!share.expiresAt) return false;
  const t = Date.parse(share.expiresAt);
  if (!Number.isFinite(t)) return false;
  return t >= now && t - now <= withinMs;
}

/**
 * Build the chronological-by-meaning activity feed for a share. Order is
 * Last-viewed (or Never), then Created, then Expiry. Each event carries a
 * relative timestamp and a tone the UI maps to a dot colour.
 */
export function buildActivityFeed(share: CaregiverShare, now: number = Date.now()): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Viewing activity (most actionable, so it leads).
  if (share.lastViewedAt) {
    events.push({
      kind: 'viewed',
      at: share.lastViewedAt,
      label: 'Last viewed',
      relative: relativeTime(share.lastViewedAt, now),
      tone: 'ok',
    });
  } else {
    events.push({
      kind: 'never-viewed',
      at: null,
      label: 'Last viewed',
      relative: 'never opened',
      tone: 'neutral',
    });
  }

  // Creation.
  events.push({
    kind: 'created',
    at: share.createdAt,
    label: 'Created',
    relative: relativeTime(share.createdAt, now),
    tone: 'neutral',
  });

  // Expiry (only when one is set).
  if (share.expiresAt) {
    const expired = isExpired(share, now);
    const soon = isExpiringSoon(share, now);
    events.push({
      kind: expired ? 'expired' : 'expires',
      at: share.expiresAt,
      label: expired ? 'Expired' : 'Expires',
      relative: relativeTime(share.expiresAt, now),
      tone: expired ? 'danger' : soon ? 'warn' : 'neutral',
    });
  }

  return events;
}

const SCOPE_LABELS: Record<string, string> = {
  'view-meds': 'View medications',
  'view-adherence': 'View adherence',
  'view-refills': 'View refills',
  'request-refill': 'Request refills',
  'view-history': 'View history',
  'manage': 'Full access',
};

/** Friendly label for a scope token, falling back to a title-cased slug. */
export function scopeLabel(scope: string): string {
  if (SCOPE_LABELS[scope]) return SCOPE_LABELS[scope]!;
  return scope
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface ActivitySummary {
  events: ActivityEvent[];
  viewed: boolean;
  expired: boolean;
  expiringSoon: boolean;
  /** Days since the share was last viewed, or null when never viewed. */
  daysSinceViewed: number | null;
}

export function summarizeActivity(share: CaregiverShare, now: number = Date.now()): ActivitySummary {
  const daysSinceViewed = share.lastViewedAt
    ? Math.max(0, Math.floor((now - Date.parse(share.lastViewedAt)) / DAY))
    : null;
  return {
    events: buildActivityFeed(share, now),
    viewed: Boolean(share.lastViewedAt),
    expired: isExpired(share, now),
    expiringSoon: isExpiringSoon(share, now),
    daysSinceViewed: daysSinceViewed != null && Number.isFinite(daysSinceViewed) ? daysSinceViewed : null,
  };
}
