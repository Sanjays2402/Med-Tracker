/**
 * Regimen snapshot archive history rollup CSV export merge anonymise
 * key-rotate BULK — CLI summary lines.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary`
 * already covers the SINGLE-rotation case: it emits one fixed-shape
 * grep-friendly line per rotation result. That's the right granularity
 * when the cron tick rotates ONE secret per epoch transition. It is the
 * WRONG granularity when the same cron tick walks N+1 secret epochs in
 * one pass — what the bulk module is built for. A multi-epoch run wants:
 *
 *   - ONE line per epoch transition (so the scraper can tell which
 *     transition flagged), AND
 *   - ONE overall batch verdict line (so the on-call dashboard can
 *     show a single roll-up status without parsing N transitions).
 *
 * This module is the bulk-rotation companion. Given a
 * RegimenHistoryAnonymiseKeyRotateBulkResult it emits:
 *
 *   - `transitionLines` — one fixed-shape line per transition,
 *     prefixed with the epoch transition labels so a grep against
 *     a stack of nightly log files can isolate one secret rotation
 *     out of many:
 *
 *       "[key-rotate epoch=secret-2022->secret-2023] patients=14 reshuffled=14 collisions=0 verdict=ship-safe"
 *       "[key-rotate epoch=secret-2023->secret-2024] patients=14 reshuffled=0  collisions=0 verdict=no-op"
 *       "[key-rotate epoch=secret-2024->secret-2025] patients=14 reshuffled=14 collisions=2 verdict=widen-hash"
 *
 *   - `batchLine` — a single overall verdict line in batch form:
 *
 *       "[key-rotate-bulk] epochs=5 transitions=4 patients=14 noop_transitions=1 collisions_total=2 verdict=widen-hash"
 *
 *   - `summaries` — the structured per-transition summary objects
 *     so callers that need to keep walking the data downstream
 *     don't have to re-parse the lines.
 *
 * Batch verdict precedence (worst wins, parallel to the existing
 * batch helper):
 *   1. `widen-hash`   — any transition collided. Caller MUST widen
 *      hashHexLength before shipping ANY rotation in the chain.
 *   2. `empty-cohort` — zero patients in the cohort (rotation is
 *      a no-op by virtue of having nothing to rotate).
 *   3. `ship-safe`    — at least one transition reshuffled at least
 *      one patient AND no collisions anywhere.
 *   4. `no-op`        — every transition was a no-op (every secret
 *      in the chain produced identical pseudonyms; verify the
 *      rotation was actually applied).
 *
 * Fixed-shape lines for grep / awk:
 *   - transition line: `<tag> patients=N reshuffled=N collisions=N verdict=V`
 *   - batch line:      `<tag> epochs=N transitions=N patients=N noop_transitions=N collisions_total=N verdict=V`
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - RegimenHistoryAnonymiseKeyRotateBulkResult shape from
 *     regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk
 *   - summarizeAnonymiseKeyRotationForCli (per-transition line shape)
 */

import type { RegimenHistoryAnonymiseKeyRotateBulkResult } from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';
import {
  summarizeAnonymiseKeyRotationForCli,
  type AnonymiseKeyRotateCliSummary,
  type AnonymiseKeyRotateCliVerdict,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary';

export interface AnonymiseKeyRotateBulkCliSummaryOptions {
  /**
   * Tag for each per-transition line. Default '[key-rotate]'. The
   * resolved epoch labels are appended to the tag inside square
   * brackets as `epoch=<from>-><to>`, e.g.
   * `[key-rotate epoch=secret-2022->secret-2023]`.
   */
  transitionTag?: string;
  /**
   * Tag for the batch summary line. Default '[key-rotate-bulk]'.
   */
  batchTag?: string;
  /**
   * When true, suppress the per-transition lines for transitions that
   * landed `no-op` verdict (keeps the log noise down when a chain of
   * unchanged secrets sits between two real rotations). Default false.
   */
  suppressNoOpTransitions?: boolean;
}

export interface AnonymiseKeyRotateBulkTransitionSummary {
  /** 0-based source epoch index. */
  fromEpoch: number;
  /** 0-based target epoch index. */
  toEpoch: number;
  /** Source epoch label (e.g. 'secret-2022'). */
  fromEpochLabel: string;
  /** Target epoch label (e.g. 'secret-2023'). */
  toEpochLabel: string;
  /** The per-transition CLI summary. */
  cli: AnonymiseKeyRotateCliSummary;
}

export interface AnonymiseKeyRotateBulkCliSummary {
  /**
   * Per-transition lines, in epoch order (oldest -> newest). Each line
   * is `<transitionTag epoch=<from>-><to>> patients=N reshuffled=N collisions=N verdict=V`.
   * Length equals the number of transitions UNLESS
   * suppressNoOpTransitions=true, in which case no-op rows are
   * dropped.
   */
  transitionLines: string[];
  /**
   * Single overall batch line. Always emitted (no suppression flag).
   * Shape: `<batchTag> epochs=N transitions=N patients=N noop_transitions=N collisions_total=N verdict=V`.
   */
  batchLine: string;
  /**
   * Structured per-transition summaries (one per transition, NOT
   * affected by suppressNoOpTransitions — that flag only suppresses
   * the formatted line, not the structured data).
   */
  summaries: AnonymiseKeyRotateBulkTransitionSummary[];
  /** Mirror of the underlying epochCount. */
  epochCount: number;
  /** Mirror of the underlying transitionCount. */
  transitionCount: number;
  /** Total patients in the cohort (same across every transition). */
  patients: number;
  /** Number of transitions whose verdict was 'no-op'. */
  noOpTransitionCount: number;
  /** Sum of collisions across every transition. */
  collisionsTotal: number;
  /** Overall batch verdict (worst-wins precedence). */
  verdict: AnonymiseKeyRotateCliVerdict;
}

/**
 * Resolve the BATCH verdict from per-transition verdicts.
 *
 * Precedence:
 *   1. widen-hash   — any transition collided
 *   2. empty-cohort — zero patients
 *   3. ship-safe    — at least one ship-safe transition AND no collisions
 *   4. no-op        — fallback (every transition stayed identical)
 */
function pickBatchVerdict(
  summaries: AnonymiseKeyRotateBulkTransitionSummary[],
  patients: number,
): AnonymiseKeyRotateCliVerdict {
  if (summaries.some((s) => s.cli.verdict === 'widen-hash')) {
    return 'widen-hash';
  }
  if (patients === 0 || summaries.length === 0) return 'empty-cohort';
  if (summaries.some((s) => s.cli.verdict === 'ship-safe')) return 'ship-safe';
  return 'no-op';
}

/**
 * Build the CLI summary lines for a bulk rotation result.
 *
 * Emits one fixed-shape transition line per transition (epoch-labelled
 * tag) plus one batch line summarising the whole chain. Designed so a
 * stack of nightly log files can be parsed with a single regex.
 *
 * Pure / deterministic.
 */
export function summarizeAnonymiseKeyRotationBulkForCli(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
  options: AnonymiseKeyRotateBulkCliSummaryOptions = {},
): AnonymiseKeyRotateBulkCliSummary {
  const transitionTag = options.transitionTag ?? '[key-rotate]';
  const batchTag = options.batchTag ?? '[key-rotate-bulk]';
  const suppressNoOp = options.suppressNoOpTransitions ?? false;

  const summaries: AnonymiseKeyRotateBulkTransitionSummary[] = result.transitions.map(
    (t) => {
      const labelledTag =
        `${transitionTag.replace(/]$/, '')} epoch=${t.fromEpochLabel}->${t.toEpochLabel}]`;
      const cli = summarizeAnonymiseKeyRotationForCli(t.result, {
        tag: labelledTag,
      });
      return {
        fromEpoch: t.fromEpoch,
        toEpoch: t.toEpoch,
        fromEpochLabel: t.fromEpochLabel,
        toEpochLabel: t.toEpochLabel,
        cli,
      };
    },
  );

  const transitionLines: string[] = [];
  for (const s of summaries) {
    if (suppressNoOp && s.cli.verdict === 'no-op') continue;
    transitionLines.push(s.cli.line);
  }

  const patients =
    summaries.length === 0 ? 0 : summaries[0]!.cli.patients;
  const noOpTransitionCount = summaries.filter(
    (s) => s.cli.verdict === 'no-op',
  ).length;
  const collisionsTotal = summaries.reduce(
    (acc, s) => acc + s.cli.collisions,
    0,
  );
  const verdict = pickBatchVerdict(summaries, patients);

  const batchLine =
    `${batchTag} epochs=${result.epochCount} ` +
    `transitions=${result.transitionCount} ` +
    `patients=${patients} ` +
    `noop_transitions=${noOpTransitionCount} ` +
    `collisions_total=${collisionsTotal} ` +
    `verdict=${verdict}`;

  return {
    transitionLines,
    batchLine,
    summaries,
    epochCount: result.epochCount,
    transitionCount: result.transitionCount,
    patients,
    noOpTransitionCount,
    collisionsTotal,
    verdict,
  };
}

/**
 * Detect the most actionable misconfiguration for the bulk run.
 *
 * Returns a single string suitable for surfacing alongside the batch
 * line as a `[key-rotate-bulk-warn]` log entry. Null when nothing
 * actionable is detected.
 *
 *   - "widen hashHexLength: N colliding pseudonyms detected across M transitions"
 *   - "all transitions are no-op: verify the secret chain was actually rotated"
 *   - "empty cohort: upstream cohort query returned zero patients"
 *   - "single-secret chain: only one secret supplied (no rotations to apply)"
 */
export function detectAnonymiseKeyRotateBulkCliWarning(
  summary: AnonymiseKeyRotateBulkCliSummary,
): string | null {
  if (summary.verdict === 'widen-hash') {
    const transitions = summary.summaries.filter(
      (s) => s.cli.verdict === 'widen-hash',
    ).length;
    return (
      `widen hashHexLength: ${summary.collisionsTotal} colliding ` +
      `${summary.collisionsTotal === 1 ? 'pseudonym' : 'pseudonyms'} ` +
      `detected across ${transitions} ` +
      `${transitions === 1 ? 'transition' : 'transitions'}`
    );
  }
  if (
    summary.transitionCount > 0 &&
    summary.noOpTransitionCount === summary.transitionCount &&
    summary.patients > 0
  ) {
    return 'all transitions are no-op: verify the secret chain was actually rotated';
  }
  if (summary.verdict === 'empty-cohort' && summary.transitionCount > 0) {
    return 'empty cohort: upstream cohort query returned zero patients';
  }
  if (summary.transitionCount === 0) {
    return 'single-secret chain: only one secret supplied (no rotations to apply)';
  }
  return null;
}

/**
 * Convenience: collapse the per-transition + batch lines into a
 * single string suitable for one `console.log` call. Lines are
 * joined with `\n`. The batch line is ALWAYS last (so a tail -1 on
 * the log surfaces the batch verdict).
 */
export function joinAnonymiseKeyRotateBulkCliSummary(
  summary: AnonymiseKeyRotateBulkCliSummary,
): string {
  return [...summary.transitionLines, summary.batchLine].join('\n');
}
