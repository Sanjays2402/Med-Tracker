/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours wrapper.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher`
 * (call it the "thread batcher") produces a parent + replies bundle
 * for a daily QA round-trip Slack thread. The nightly cron that
 * triggers it runs at a fixed local-time slot (often midnight or
 * 02:00 to follow the overnight CSV pipeline). Slack threads land
 * with a hard "ping" for the on-call: a `chat.postMessage` to a
 * channel surfaces an unread badge, and the parent message in
 * particular drives an unread-count bump for everyone in the
 * channel.
 *
 * The QA on-call channel doesn't want a midnight unread spike
 * waking up an on-call human. Most channels have an unwritten
 * quiet-hours window — typically the period from late evening
 * to early morning in the channel's primary timezone. The standard
 * pattern is:
 *
 *   - If the run lands during quiet hours, hold the PARENT post.
 *     The replies can still ship (Slack doesn't surface
 *     thread replies as a fresh top-level notification unless the
 *     user explicitly subscribed to the thread), but the parent
 *     stays parked until the next non-quiet wake-up.
 *   - If the run is ACTIONABLE during quiet hours (real diffs,
 *     parser skips), there's a per-channel override: actionable
 *     runs may still post during quiet hours, but the parent
 *     message gets a "(deferred from quiet hours)" tag so the
 *     on-call understands the timing.
 *   - If the run is CLEAN during quiet hours, the parent stays
 *     parked and the on-call sees it at the next morning's daily
 *     check-in.
 *
 * This module is the quiet-hours wrapper. It composes
 * batchRoundtripResultsForSlackThread under the hood and adds a
 * configurable quiet-hours window + deferral policy:
 *
 *   {
 *     parentPostingDecision: 'post-now' | 'defer-until' | 'suppress-completely',
 *     deferUntil?: Date,           // when 'defer-until'
 *     reason: 'within-quiet-hours' | 'actionable-override' | 'outside-quiet-hours',
 *     parent: ..., replies: ..., coverage: ...,
 *   }
 *
 * The decision is the policy output; the bundle itself is the
 * thread batcher's output. The caller posts (or defers) the parent
 * based on the decision.
 *
 * Default quiet hours: 22:00-07:00 in America/Los_Angeles (PT).
 * Configurable per channel.
 *
 * Pure / deterministic. No I/O. No timezone gymnastics — the caller
 * provides the runAt timestamp + timezone string; we compute the
 * wall-clock hour using Intl.DateTimeFormat (built into Node 18+).
 *
 * Composes:
 *   - batchRoundtripResultsForSlackThread for the underlying bundle
 */

import type {
  DoseRoundtripThreadBatcherOptions,
  DoseRoundtripThreadBatcherResult,
  DoseRoundtripThreadBatcherRun,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';
import { batchRoundtripResultsForSlackThread } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';

export interface DoseRoundtripThreadBatcherQuietHoursWindow {
  /** Inclusive start hour in the channel's local time (0-23). */
  startHour: number;
  /** Exclusive end hour in the channel's local time (0-23). */
  endHour: number;
  /**
   * IANA timezone for evaluating the wall-clock hour against the
   * window. Default 'America/Los_Angeles'.
   */
  timezone?: string;
}

export type DoseRoundtripThreadBatcherQuietHoursPolicy =
  /** Defer parent post until end of quiet hours (default). */
  | 'defer-parent'
  /**
   * Defer parent unless the run is actionable (real diffs / parser
   * skips), in which case post immediately with an override tag.
   */
  | 'defer-unless-actionable'
  /**
   * Suppress parent completely during quiet hours (replies still
   * built for downstream archive but no Slack post). For channels
   * that intentionally don't want a deferred parent at all.
   */
  | 'suppress-completely';

export interface DoseRoundtripThreadBatcherQuietHoursOptions
  extends DoseRoundtripThreadBatcherOptions {
  /**
   * Wall-clock instant the run started. Default new Date(). The
   * policy compares this against the quietHours window to decide
   * whether to post.
   */
  runAt?: Date;
  /**
   * Quiet-hours window. Default 22:00-07:00 PT.
   */
  quietHours?: DoseRoundtripThreadBatcherQuietHoursWindow;
  /**
   * Policy to apply during quiet hours. Default 'defer-parent'.
   */
  policy?: DoseRoundtripThreadBatcherQuietHoursPolicy;
  /**
   * When policy=='defer-parent' or 'defer-unless-actionable' (and
   * we end up deferring), tag prepended to the parent header so
   * the on-call understands the deferral. Default
   * "(deferred from {windowLabel})".
   */
  deferralTagTemplate?: string;
  /**
   * Skip the quiet-hours check entirely. Useful for unit tests
   * and for manual cron triggers. Default false.
   */
  skipQuietHoursCheck?: boolean;
}

export type DoseRoundtripThreadBatcherQuietHoursDecision =
  | { kind: 'post-now'; reason: 'outside-quiet-hours' | 'actionable-override' | 'skip-flag' }
  | { kind: 'defer-until'; reason: 'within-quiet-hours'; deferUntil: Date; windowLabel: string }
  | { kind: 'suppress-completely'; reason: 'within-quiet-hours'; windowLabel: string };

export interface DoseRoundtripThreadBatcherQuietHoursResult {
  /** The decision the caller should act on. */
  decision: DoseRoundtripThreadBatcherQuietHoursDecision;
  /**
   * The underlying thread-batcher bundle. Parent + replies + coverage
   * unchanged from the upstream module — when the decision is
   * 'defer-until', the caller posts these at deferUntil. When
   * 'suppress-completely', the caller archives the bundle without
   * posting.
   *
   * When the decision is 'post-now' AND we DEFERRED (the actionable-
   * override case), the parent's fallbackText is suffixed with the
   * deferral-override tag so the on-call understands why a midnight
   * ping arrived.
   */
  bundle: DoseRoundtripThreadBatcherResult;
}

const DEFAULT_QUIET_HOURS: DoseRoundtripThreadBatcherQuietHoursWindow = {
  startHour: 22,
  endHour: 7,
  timezone: 'America/Los_Angeles',
};

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_DEFERRAL_TAG_TEMPLATE = '(deferred from {windowLabel})';

function localHour(d: Date, timezone: string): number {
  // Intl.DateTimeFormat with hour12=false and a target timezone
  // returns the wall-clock hour as a string in that timezone.
  // Available in Node 18+ by default.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
  });
  const part = fmt.formatToParts(d).find((p) => p.type === 'hour');
  if (!part) return d.getHours();
  // The 'hour' part comes back as a 2-digit zero-padded string;
  // strictly numeric. Strip non-digits and parse.
  const raw = part.value.replace(/\D/g, '');
  const n = parseInt(raw, 10);
  // Intl en-US locale returns "24" for midnight under some platforms;
  // normalise to 0.
  return n === 24 ? 0 : n;
}

function isWithinQuietHours(
  d: Date,
  window: DoseRoundtripThreadBatcherQuietHoursWindow,
): boolean {
  const tz = window.timezone ?? DEFAULT_TIMEZONE;
  const h = localHour(d, tz);
  // Window either fits within a single day (start < end) or wraps
  // across midnight (start > end). 22-7 means h >= 22 || h < 7.
  if (window.startHour <= window.endHour) {
    return h >= window.startHour && h < window.endHour;
  }
  return h >= window.startHour || h < window.endHour;
}

function nextEndOfQuietHours(
  d: Date,
  window: DoseRoundtripThreadBatcherQuietHoursWindow,
): Date {
  const tz = window.timezone ?? DEFAULT_TIMEZONE;
  // Step forward in 30-minute increments until we find the first
  // moment that is NOT within quiet hours. Bounded to 36h to avoid
  // a runaway loop even on weird timezone definitions.
  const STEP_MS = 30 * 60 * 1000;
  const MAX_ITER = 72; // 36 hours
  let cur = new Date(d.getTime());
  for (let i = 0; i < MAX_ITER; i++) {
    cur = new Date(cur.getTime() + STEP_MS);
    if (!isWithinQuietHours(cur, { ...window, timezone: tz })) {
      // Snap forward to the next exact end-hour boundary in local
      // time so the deferral lands at a stable wall-clock minute.
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const parts = fmt.formatToParts(cur);
      const m = parts.find((p) => p.type === 'minute');
      const minute = m ? parseInt(m.value.replace(/\D/g, ''), 10) : 0;
      if (minute !== 0) {
        // Trim forward to top-of-hour by adding the remaining minutes.
        const trimMs = (60 - minute) * 60 * 1000;
        cur = new Date(cur.getTime() + trimMs);
      }
      return cur;
    }
  }
  // Defensive: return the original + 24h.
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

function windowLabel(
  window: DoseRoundtripThreadBatcherQuietHoursWindow,
): string {
  const tz = window.timezone ?? DEFAULT_TIMEZONE;
  const start = String(window.startHour).padStart(2, '0');
  const end = String(window.endHour).padStart(2, '0');
  return `${start}:00-${end}:00 ${tz}`;
}

function isActionable(result: DoseRoundtripThreadBatcherResult): boolean {
  const c = result.coverage;
  return (
    c.totalDiffs > 0 ||
    c.totalAdded > 0 ||
    c.totalRemoved > 0 ||
    c.totalParserSkips > 0
  );
}

function tagFallbackWithDeferralOverride(
  bundle: DoseRoundtripThreadBatcherResult,
  tag: string,
): DoseRoundtripThreadBatcherResult {
  return {
    ...bundle,
    parent: {
      ...bundle.parent,
      fallbackText: `${bundle.parent.fallbackText} ${tag}`,
    },
  };
}

function renderDeferralTag(
  template: string,
  window: DoseRoundtripThreadBatcherQuietHoursWindow,
): string {
  return template.replace(/\{windowLabel\}/g, windowLabel(window));
}

/**
 * Build the thread-batcher bundle AND a quiet-hours posting decision.
 *
 * The returned `decision` tells the caller whether to post the
 * parent immediately, defer it until a later instant, or suppress
 * it entirely. The returned `bundle` is the standard thread-batcher
 * output (parent + replies + coverage), suitable for posting at
 * the decision's instant or archiving.
 *
 * Pure / deterministic given (runAt, quietHours, runs).
 */
export function batchRoundtripResultsForSlackThreadWithQuietHours(
  runs: DoseRoundtripThreadBatcherRun[],
  options: DoseRoundtripThreadBatcherQuietHoursOptions = {},
): DoseRoundtripThreadBatcherQuietHoursResult {
  const runAt = options.runAt ?? new Date();
  const window = options.quietHours ?? DEFAULT_QUIET_HOURS;
  const policy = options.policy ?? 'defer-parent';
  const deferralTagTemplate =
    options.deferralTagTemplate ?? DEFAULT_DEFERRAL_TAG_TEMPLATE;

  // Build the underlying bundle first — we may attach a tag below.
  const baseBundle = batchRoundtripResultsForSlackThread(runs, options);

  if (options.skipQuietHoursCheck) {
    return {
      decision: { kind: 'post-now', reason: 'skip-flag' },
      bundle: baseBundle,
    };
  }

  if (!isWithinQuietHours(runAt, window)) {
    return {
      decision: { kind: 'post-now', reason: 'outside-quiet-hours' },
      bundle: baseBundle,
    };
  }

  // We're inside quiet hours — pick action based on policy.
  if (policy === 'suppress-completely') {
    return {
      decision: {
        kind: 'suppress-completely',
        reason: 'within-quiet-hours',
        windowLabel: windowLabel(window),
      },
      bundle: baseBundle,
    };
  }

  if (policy === 'defer-unless-actionable' && isActionable(baseBundle)) {
    const tag = renderDeferralTag(
      '(actionable override during {windowLabel})',
      window,
    );
    return {
      decision: { kind: 'post-now', reason: 'actionable-override' },
      bundle: tagFallbackWithDeferralOverride(baseBundle, tag),
    };
  }

  // 'defer-parent' (default) OR 'defer-unless-actionable' with a
  // non-actionable run inside quiet hours -> defer.
  const deferUntil = nextEndOfQuietHours(runAt, window);
  const tag = renderDeferralTag(deferralTagTemplate, window);
  return {
    decision: {
      kind: 'defer-until',
      reason: 'within-quiet-hours',
      deferUntil,
      windowLabel: windowLabel(window),
    },
    bundle: tagFallbackWithDeferralOverride(baseBundle, tag),
  };
}

/**
 * Convenience: a one-line summary of the quiet-hours decision for the
 * cron log.
 *
 *   "Slack thread quiet hours: posted immediately (outside-quiet-hours)."
 *   "Slack thread quiet hours: deferred until 2026-06-22T15:00:00Z
 *    (within 22:00-07:00 America/Los_Angeles)."
 *   "Slack thread quiet hours: posted with actionable override
 *    during 22:00-07:00 America/Los_Angeles."
 *   "Slack thread quiet hours: suppressed (within 22:00-07:00 ...)."
 */
export function summarizeQuietHoursDecision(
  result: DoseRoundtripThreadBatcherQuietHoursResult,
): string {
  const d = result.decision;
  if (d.kind === 'post-now') {
    if (d.reason === 'outside-quiet-hours') {
      return 'Slack thread quiet hours: posted immediately (outside quiet hours).';
    }
    if (d.reason === 'actionable-override') {
      // We re-derive the window label from the fallback-tagged text;
      // it's not on the post-now decision shape.
      return 'Slack thread quiet hours: posted with actionable override during quiet hours.';
    }
    return 'Slack thread quiet hours: posted immediately (quiet-hours check skipped).';
  }
  if (d.kind === 'defer-until') {
    return `Slack thread quiet hours: deferred until ${d.deferUntil.toISOString()} (within ${d.windowLabel}).`;
  }
  return `Slack thread quiet hours: suppressed (within ${d.windowLabel}).`;
}

/**
 * Convenience: a deferral-aware posting recommendation. Returns
 *  `{ shouldPostNow: true,  postAt: now }` when post-now
 *  `{ shouldPostNow: false, postAt: deferUntil }` when defer-until
 *  `{ shouldPostNow: false, postAt: null }` when suppress-completely
 *
 * For pipelines that want a one-shape posting decision instead of a
 * discriminated union.
 */
export function postingRecommendation(
  result: DoseRoundtripThreadBatcherQuietHoursResult,
): { shouldPostNow: boolean; postAt: Date | null } {
  const d = result.decision;
  if (d.kind === 'post-now') return { shouldPostNow: true, postAt: new Date() };
  if (d.kind === 'defer-until')
    return { shouldPostNow: false, postAt: d.deferUntil };
  return { shouldPostNow: false, postAt: null };
}
