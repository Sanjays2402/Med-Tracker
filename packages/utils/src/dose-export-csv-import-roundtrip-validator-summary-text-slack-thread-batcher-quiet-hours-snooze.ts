/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours, snooze override.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours`
 * (the quiet-hours module) defers thread-parent posts during a
 * channel's configured quiet window. The default policy is
 * 'defer-parent' which is the right setting for ordinary nights.
 *
 * Incident-response weekends break the default. During an active
 * outage / on-call rotation, the QA on-call WANTS the unread badge
 * even at midnight — the round-trip validator's diff stream is one
 * of the signals that something just broke in the overnight CSV
 * pipeline, and a deferred parent message hides that signal until
 * 07:00. The on-call has to manually paste an override into the
 * quiet-hours config and remember to revert it after the incident.
 *
 * This module is the per-channel snooze override. It wraps a
 * quiet-hours decision and:
 *
 *   - given a `snoozeUntil` instant, if the run is happening BEFORE
 *     the snoozeUntil, override the quiet-hours decision and post
 *     immediately ('snooze-override' reason);
 *   - given a `snoozeFor` duration, compute the snooze-until from
 *     the run-at + duration;
 *   - tag the parent fallback with "(snooze-overridden during
 *     {windowLabel} until {snoozeUntil})" so the on-call knows
 *     the override is active and when it lapses.
 *
 * The snooze is per-CALL: a one-shot override the cron passes in,
 * not a persistent state. Callers store the snoozeUntil instant in
 * their own config layer (file / KV) and pass it in on every run
 * until it expires.
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - batchRoundtripResultsForSlackThreadWithQuietHours
 *   - DoseRoundtripThreadBatcherQuietHoursDecision shape
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursDecision,
  DoseRoundtripThreadBatcherQuietHoursOptions,
  DoseRoundtripThreadBatcherQuietHoursResult,
  DoseRoundtripThreadBatcherQuietHoursWindow,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';
import { batchRoundtripResultsForSlackThreadWithQuietHours } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';
import type {
  DoseRoundtripThreadBatcherResult,
  DoseRoundtripThreadBatcherRun,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';

export interface DoseRoundtripThreadBatcherQuietHoursSnoozeOptions
  extends DoseRoundtripThreadBatcherQuietHoursOptions {
  /**
   * Hard instant the snooze expires. When set AND runAt < snoozeUntil,
   * the quiet-hours decision is overridden to post-now with reason
   * 'snooze-override'. Takes precedence over snoozeFor when both are
   * given.
   */
  snoozeUntil?: Date;
  /**
   * Convenience: snooze for N milliseconds from runAt. Derived
   * snoozeUntil = runAt + snoozeForMs. Ignored when snoozeUntil is
   * also provided.
   */
  snoozeForMs?: number;
  /**
   * Tag template for the parent fallback when the snooze override
   * fires. Default "(snooze override during {windowLabel} until
   * {snoozeUntil})". {snoozeUntil} interpolated as ISO string.
   */
  snoozeOverrideTagTemplate?: string;
}

export type DoseRoundtripThreadBatcherQuietHoursSnoozeDecision =
  | DoseRoundtripThreadBatcherQuietHoursDecision
  | {
      kind: 'post-now';
      reason: 'snooze-override';
      snoozeUntil: Date;
      windowLabel: string;
    };

export interface DoseRoundtripThreadBatcherQuietHoursSnoozeResult {
  decision: DoseRoundtripThreadBatcherQuietHoursSnoozeDecision;
  bundle: DoseRoundtripThreadBatcherResult;
  /**
   * Effective snoozeUntil applied (from snoozeUntil or runAt+snoozeForMs).
   * Null when the call had no snooze configured (decision is the
   * underlying quiet-hours decision unchanged).
   */
  snoozeUntilApplied: Date | null;
  /**
   * True when the snooze actually overrode an inside-quiet-hours
   * decision. False when:
   *   - no snooze was configured, OR
   *   - snooze was configured but runAt was past snoozeUntil, OR
   *   - snooze was configured but the underlying decision was
   *     already 'post-now' (no override needed).
   */
  snoozeOverrideApplied: boolean;
}

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_SNOOZE_TAG =
  '(snooze override during {windowLabel} until {snoozeUntil})';

function windowLabelOf(
  window: DoseRoundtripThreadBatcherQuietHoursWindow,
): string {
  const tz = window.timezone ?? DEFAULT_TIMEZONE;
  const start = String(window.startHour).padStart(2, '0');
  const end = String(window.endHour).padStart(2, '0');
  return `${start}:00-${end}:00 ${tz}`;
}

function renderSnoozeTag(
  template: string,
  window: DoseRoundtripThreadBatcherQuietHoursWindow,
  snoozeUntil: Date,
): string {
  return template
    .replace(/\{windowLabel\}/g, windowLabelOf(window))
    .replace(/\{snoozeUntil\}/g, snoozeUntil.toISOString());
}

function appendTagToFallback(
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

function resolveEffectiveSnooze(
  runAt: Date,
  options: DoseRoundtripThreadBatcherQuietHoursSnoozeOptions,
): Date | null {
  if (options.snoozeUntil !== undefined) return options.snoozeUntil;
  if (options.snoozeForMs !== undefined) {
    if (
      typeof options.snoozeForMs !== 'number' ||
      !Number.isFinite(options.snoozeForMs)
    ) {
      throw new Error('snoozeForMs must be a finite number when provided.');
    }
    return new Date(runAt.getTime() + options.snoozeForMs);
  }
  return null;
}

/**
 * Build the thread-batcher bundle + a snooze-aware quiet-hours
 * posting decision.
 *
 * Behaviour:
 *   1. Compute the standard quiet-hours decision via
 *      batchRoundtripResultsForSlackThreadWithQuietHours.
 *   2. Resolve the effective snoozeUntil from snoozeUntil OR
 *      runAt + snoozeForMs.
 *   3. If the underlying decision is post-now, do nothing (no
 *      override needed — we're already posting).
 *   4. If the underlying decision is defer-until OR
 *      suppress-completely AND runAt < snoozeUntil, override to
 *      post-now with reason 'snooze-override'.
 *   5. If runAt >= snoozeUntil, do nothing (snooze has lapsed).
 *
 * Pure / deterministic.
 */
export function batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
  runs: DoseRoundtripThreadBatcherRun[],
  options: DoseRoundtripThreadBatcherQuietHoursSnoozeOptions = {},
): DoseRoundtripThreadBatcherQuietHoursSnoozeResult {
  const runAt = options.runAt ?? new Date();
  const baseResult = batchRoundtripResultsForSlackThreadWithQuietHours(
    runs,
    options,
  );

  const snoozeUntil = resolveEffectiveSnooze(runAt, options);

  // No snooze configured -> return base result unchanged.
  if (snoozeUntil === null) {
    return {
      decision: baseResult.decision,
      bundle: baseResult.bundle,
      snoozeUntilApplied: null,
      snoozeOverrideApplied: false,
    };
  }

  // Snooze has lapsed -> return base result unchanged but report snooze.
  if (runAt.getTime() >= snoozeUntil.getTime()) {
    return {
      decision: baseResult.decision,
      bundle: baseResult.bundle,
      snoozeUntilApplied: snoozeUntil,
      snoozeOverrideApplied: false,
    };
  }

  // Underlying decision already post-now -> no override needed.
  if (baseResult.decision.kind === 'post-now') {
    return {
      decision: baseResult.decision,
      bundle: baseResult.bundle,
      snoozeUntilApplied: snoozeUntil,
      snoozeOverrideApplied: false,
    };
  }

  // Override: defer-until / suppress-completely -> post-now with
  // snooze-override reason.
  const window = options.quietHours ?? {
    startHour: 22,
    endHour: 7,
    timezone: 'America/Los_Angeles',
  };
  const tagTemplate = options.snoozeOverrideTagTemplate ?? DEFAULT_SNOOZE_TAG;
  const tag = renderSnoozeTag(tagTemplate, window, snoozeUntil);

  return {
    decision: {
      kind: 'post-now',
      reason: 'snooze-override',
      snoozeUntil,
      windowLabel: windowLabelOf(window),
    },
    bundle: appendTagToFallback(baseResult.bundle, tag),
    snoozeUntilApplied: snoozeUntil,
    snoozeOverrideApplied: true,
  };
}

/**
 * Convenience: a one-line cron-log summary for the snooze decision.
 *
 *   "Slack thread snooze: override applied (posted during quiet hours
 *    until 2026-06-23T07:00:00.000Z)."
 *   "Slack thread snooze: no override (snooze expired)."
 *   "Slack thread snooze: no override (no snooze configured)."
 *   "Slack thread snooze: no override (decision already post-now)."
 */
export function summarizeSnoozeDecision(
  result: DoseRoundtripThreadBatcherQuietHoursSnoozeResult,
): string {
  if (result.snoozeOverrideApplied) {
    const d = result.decision;
    if (d.kind === 'post-now' && d.reason === 'snooze-override') {
      return `Slack thread snooze: override applied (posted during quiet hours until ${d.snoozeUntil.toISOString()}).`;
    }
    return 'Slack thread snooze: override applied.';
  }
  if (result.snoozeUntilApplied === null) {
    return 'Slack thread snooze: no override (no snooze configured).';
  }
  // Snooze configured but not applied.
  if (result.decision.kind === 'post-now') {
    return 'Slack thread snooze: no override (decision already post-now).';
  }
  return 'Slack thread snooze: no override (snooze expired).';
}

/**
 * Convenience: was the snooze ACTIVE at runAt (i.e. configured AND
 * not yet expired)? Returns true regardless of whether the override
 * actually fired (the underlying decision might have already been
 * post-now).
 */
export function isSnoozeActive(
  result: DoseRoundtripThreadBatcherQuietHoursSnoozeResult,
  runAt: Date,
): boolean {
  if (result.snoozeUntilApplied === null) return false;
  return runAt.getTime() < result.snoozeUntilApplied.getTime();
}

/**
 * Convenience: a posting recommendation that's snooze-aware,
 * matching postingRecommendation from the quiet-hours module.
 *
 *   { shouldPostNow: true,  postAt: now } - post-now (any reason)
 *   { shouldPostNow: false, postAt: deferUntil } - defer-until
 *   { shouldPostNow: false, postAt: null } - suppress-completely
 */
export function snoozeAwarePostingRecommendation(
  result: DoseRoundtripThreadBatcherQuietHoursSnoozeResult,
): { shouldPostNow: boolean; postAt: Date | null } {
  const d = result.decision;
  if (d.kind === 'post-now') return { shouldPostNow: true, postAt: new Date() };
  if (d.kind === 'defer-until')
    return { shouldPostNow: false, postAt: d.deferUntil };
  return { shouldPostNow: false, postAt: null };
}
