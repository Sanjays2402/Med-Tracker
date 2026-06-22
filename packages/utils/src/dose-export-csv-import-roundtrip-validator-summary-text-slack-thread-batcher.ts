/**
 * Dose export CSV import round-trip validator — summary text Slack
 * thread batcher.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack`
 * ships ONE Slack Block Kit message per round-trip result. A QA
 * on-call channel reviewing N round-trips per day doesn't want N
 * separate top-level messages — that's channel noise. The standard
 * Slack pattern is a single PARENT message ("Daily QA round-trip
 * digest, N runs reviewed") followed by N REPLY messages in the
 * same thread, so the channel only sees one new line per day and
 * the on-call drills in by clicking through.
 *
 * This module is the thread batcher: feed it N daily results and
 * it returns a structured (parent, replies[]) payload ready to ship
 * via chat.postMessage. Two API calls per day, regardless of N:
 *
 *   1. POST chat.postMessage with parent.blocks  -> returns ts
 *   2. for each reply: POST chat.postMessage with thread_ts=ts
 *
 * Pure / deterministic. No I/O. The caller does the two-stage Slack
 * POST.
 *
 * Composes:
 *   - summarizeRoundtripResultSlack for the per-run reply blocks
 *
 * Parent block design:
 *   - header: "Daily QA round-trip digest"
 *   - context: date label + "N runs reviewed"
 *   - section: aggregate stats (total unchanged, total diffs,
 *     total parser skips, total added, total removed across runs)
 *   - context: per-tier rollup ("Structural 12 · Mixed 7 · ...")
 *   - actions: optional "Open QA dashboard" button
 *
 * Reply blocks per run mirror the per-result Slack output so the
 * on-call sees the same content they'd see in the standalone run.
 */

import type { DoseRoundtripValidateResult, DoseRoundtripDiff } from './dose-export-csv-import-roundtrip-validator';
import {
  summarizeRoundtripResultSlack,
  type DoseRoundtripSlackBlock,
  type DoseRoundtripSlackOptions,
  type DoseRoundtripSlackResult,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack';

export interface DoseRoundtripThreadBatcherRun {
  /** Stable run id (used as the per-reply title suffix). */
  runId: string;
  /** Human-readable label for the run (e.g. "2026-06-22 nightly"). */
  runLabel: string;
  /** Round-trip result for this run. */
  result: DoseRoundtripValidateResult;
  /** Per-run Slack options forwarded to the underlying per-run renderer. */
  perRunOptions?: DoseRoundtripSlackOptions;
}

export interface DoseRoundtripThreadBatcherOptions {
  /** Parent message header. Default "Daily QA round-trip digest". */
  parentTitle?: string;
  /** Date label shown in the parent context (e.g. "Wed 2026-06-22"). */
  dateLabel?: string;
  /**
   * Optional URL the "Open QA dashboard" button on the PARENT links
   * to. Same https-only gating as the per-run renderer.
   */
  dashboardUrl?: string;
  /** Button label override. Default "Open QA dashboard". */
  dashboardButtonLabel?: string;
  /**
   * Suppress runs with zero diffs / zero parser skips / zero added /
   * zero removed from the replies (parent rollup still counts them).
   * Default false — even a clean run is worth a reply so the
   * thread serves as a complete audit trail.
   */
  suppressCleanRuns?: boolean;
}

export interface DoseRoundtripThreadBatcherReply {
  runId: string;
  runLabel: string;
  /** Slack Block Kit blocks for this reply. */
  blocks: DoseRoundtripSlackBlock[];
  /** Short fallback text for the notification preview. */
  fallbackText: string;
  /** True if the per-run renderer hit the 50-block Slack cap. */
  truncated: boolean;
}

export interface DoseRoundtripThreadBatcherParent {
  /** Slack Block Kit blocks for the parent message. */
  blocks: DoseRoundtripSlackBlock[];
  /** Short fallback text for the notification preview. */
  fallbackText: string;
}

export interface DoseRoundtripThreadBatcherCoverage {
  /** Total runs fed to the batcher. */
  runCount: number;
  /** Runs whose result had at least one diff / added / removed / parser skip. */
  actionableRunCount: number;
  /** Runs suppressed from the replies (always zero when suppressCleanRuns=false). */
  suppressedRunCount: number;
  /** Aggregate unchanged dose count across all runs. */
  totalUnchanged: number;
  /** Aggregate diff count across all runs. */
  totalDiffs: number;
  /** Aggregate added count across all runs. */
  totalAdded: number;
  /** Aggregate removed count across all runs. */
  totalRemoved: number;
  /** Aggregate parser skip count across all runs. */
  totalParserSkips: number;
  /** Per-tier diff count rollup across all runs. */
  byRisk: Record<DoseRoundtripDiff['risk'], number>;
}

export interface DoseRoundtripThreadBatcherResult {
  parent: DoseRoundtripThreadBatcherParent;
  replies: DoseRoundtripThreadBatcherReply[];
  coverage: DoseRoundtripThreadBatcherCoverage;
}

const TIER_LABEL: Record<DoseRoundtripDiff['risk'], string> = {
  structural: 'Structural',
  mixed: 'Mixed',
  'status-edit': 'Status edit',
  'note-only': 'Note only',
};

const TIER_PRIORITY: DoseRoundtripDiff['risk'][] = [
  'structural',
  'mixed',
  'status-edit',
  'note-only',
];

function makeHeader(text: string): DoseRoundtripSlackBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}
function makeContext(mrkdwn: string): DoseRoundtripSlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text: mrkdwn }] };
}
function makeSection(mrkdwn: string): DoseRoundtripSlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: mrkdwn } };
}
function makeActions(label: string, url: string): DoseRoundtripSlackBlock {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: label, emoji: false },
        url,
        style: 'primary',
      },
    ],
  };
}

function isActionable(result: DoseRoundtripValidateResult): boolean {
  return (
    result.diffs.length > 0 ||
    result.addedIds.length > 0 ||
    result.removedIds.length > 0 ||
    result.parseSkipped.length > 0
  );
}

function aggregateCoverage(
  runs: DoseRoundtripThreadBatcherRun[],
  suppressedCount: number,
): DoseRoundtripThreadBatcherCoverage {
  const byRisk: Record<DoseRoundtripDiff['risk'], number> = {
    structural: 0,
    mixed: 0,
    'status-edit': 0,
    'note-only': 0,
  };
  let totalUnchanged = 0;
  let totalDiffs = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalParserSkips = 0;
  let actionable = 0;
  for (const run of runs) {
    totalUnchanged += run.result.unchangedCount;
    totalDiffs += run.result.diffs.length;
    totalAdded += run.result.addedIds.length;
    totalRemoved += run.result.removedIds.length;
    totalParserSkips += run.result.parseSkipped.length;
    for (const d of run.result.diffs) byRisk[d.risk] += 1;
    if (isActionable(run.result)) actionable += 1;
  }
  return {
    runCount: runs.length,
    actionableRunCount: actionable,
    suppressedRunCount: suppressedCount,
    totalUnchanged,
    totalDiffs,
    totalAdded,
    totalRemoved,
    totalParserSkips,
    byRisk,
  };
}

function buildParent(
  runs: DoseRoundtripThreadBatcherRun[],
  options: DoseRoundtripThreadBatcherOptions,
  coverage: DoseRoundtripThreadBatcherCoverage,
): DoseRoundtripThreadBatcherParent {
  const title = options.parentTitle ?? 'Daily QA round-trip digest';
  const dateLabel = options.dateLabel ?? '';
  const blocks: DoseRoundtripSlackBlock[] = [];
  blocks.push(makeHeader(title));
  const headerContext = dateLabel.length > 0
    ? `${dateLabel} · ${coverage.runCount} ${coverage.runCount === 1 ? 'run' : 'runs'} reviewed`
    : `${coverage.runCount} ${coverage.runCount === 1 ? 'run' : 'runs'} reviewed`;
  blocks.push(makeContext(headerContext));
  const summary =
    `*${coverage.totalUnchanged}* unchanged · ` +
    `*${coverage.totalDiffs}* diffs · ` +
    `*${coverage.totalAdded}* added · ` +
    `*${coverage.totalRemoved}* removed · ` +
    `*${coverage.totalParserSkips}* parser ${coverage.totalParserSkips === 1 ? 'skip' : 'skips'}`;
  blocks.push(makeSection(summary));
  const tierParts: string[] = [];
  for (const tier of TIER_PRIORITY) {
    const count = coverage.byRisk[tier];
    if (count > 0) tierParts.push(`${TIER_LABEL[tier]} ${count}`);
  }
  if (tierParts.length > 0) {
    blocks.push(makeContext(`Per-tier rollup: ${tierParts.join(' · ')}`));
  }
  if (coverage.actionableRunCount < coverage.runCount) {
    const clean = coverage.runCount - coverage.actionableRunCount;
    blocks.push(makeContext(`_${clean} clean ${clean === 1 ? 'run' : 'runs'} (no diffs, no parser skips)._`));
  }
  if (options.dashboardUrl && options.dashboardUrl.startsWith('https://')) {
    const label = options.dashboardButtonLabel ?? 'Open QA dashboard';
    blocks.push(makeActions(label, options.dashboardUrl));
  }
  const fallbackText =
    `${title}: ${coverage.runCount} ${coverage.runCount === 1 ? 'run' : 'runs'}, ` +
    `${coverage.totalDiffs} diffs, ${coverage.totalAdded} added, ${coverage.totalRemoved} removed, ` +
    `${coverage.totalParserSkips} parser ${coverage.totalParserSkips === 1 ? 'skip' : 'skips'}`;
  return { blocks, fallbackText };
}

function buildReply(
  run: DoseRoundtripThreadBatcherRun,
): DoseRoundtripThreadBatcherReply {
  const perRunOptions: DoseRoundtripSlackOptions = {
    title: run.runLabel,
    ...(run.perRunOptions ?? {}),
  };
  const inner: DoseRoundtripSlackResult = summarizeRoundtripResultSlack(
    run.result,
    perRunOptions,
  );
  return {
    runId: run.runId,
    runLabel: run.runLabel,
    blocks: inner.blocks,
    fallbackText: inner.fallbackText,
    truncated: inner.truncated,
  };
}

/**
 * Build a parent + replies bundle for the daily QA Slack thread.
 *
 * The caller posts parent first (chat.postMessage with blocks +
 * fallback text), receives the parent `ts`, then posts each reply
 * with thread_ts=<parent ts>. The replies array preserves input
 * run order so the thread reads chronologically.
 *
 * When `suppressCleanRuns` is true and a run has no diffs / added /
 * removed / parser skips, its reply is dropped but its counts
 * still appear in the parent rollup (so the on-call sees the
 * aggregate without scrolling through a stack of "no changes" rows).
 *
 * Pure / deterministic.
 */
export function batchRoundtripResultsForSlackThread(
  runs: DoseRoundtripThreadBatcherRun[],
  options: DoseRoundtripThreadBatcherOptions = {},
): DoseRoundtripThreadBatcherResult {
  const suppressClean = options.suppressCleanRuns ?? false;
  const replies: DoseRoundtripThreadBatcherReply[] = [];
  let suppressedCount = 0;
  for (const run of runs) {
    if (suppressClean && !isActionable(run.result)) {
      suppressedCount += 1;
      continue;
    }
    replies.push(buildReply(run));
  }
  const coverage = aggregateCoverage(runs, suppressedCount);
  const parent = buildParent(runs, options, coverage);
  return { parent, replies, coverage };
}

/**
 * Convenience: build a one-line summary of the thread batch for
 * the cron log.
 *
 *   "Daily QA round-trip thread: 7 runs (5 actionable, 2 suppressed):
 *    23 diffs, 4 parser skips."
 */
export function summarizeRoundtripThreadBatch(
  result: DoseRoundtripThreadBatcherResult,
): string {
  const c = result.coverage;
  const suppressBit =
    c.suppressedRunCount > 0
      ? `, ${c.suppressedRunCount} suppressed`
      : '';
  const runs = `${c.runCount} ${c.runCount === 1 ? 'run' : 'runs'}`;
  return (
    `Daily QA round-trip thread: ${runs} (${c.actionableRunCount} actionable${suppressBit}): ` +
    `${c.totalDiffs} ${c.totalDiffs === 1 ? 'diff' : 'diffs'}, ` +
    `${c.totalParserSkips} parser ${c.totalParserSkips === 1 ? 'skip' : 'skips'}.`
  );
}
