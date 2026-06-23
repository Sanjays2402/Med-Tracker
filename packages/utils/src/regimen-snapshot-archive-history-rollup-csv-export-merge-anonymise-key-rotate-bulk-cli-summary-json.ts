/**
 * Regimen snapshot archive history rollup CSV export merge anonymise
 * key-rotate BULK CLI summary — STRUCTURED JSON variant.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary`
 * emits N + 1 fixed-shape grep-friendly lines:
 *
 *   "[key-rotate epoch=secret-2022->secret-2023] patients=14 reshuffled=14 collisions=0 verdict=ship-safe"
 *   "[key-rotate epoch=secret-2023->secret-2024] patients=14 reshuffled=0  collisions=0 verdict=no-op"
 *   "[key-rotate epoch=secret-2024->secret-2025] patients=14 reshuffled=14 collisions=2 verdict=widen-hash"
 *   "[key-rotate-bulk] epochs=4 transitions=3 patients=14 noop_transitions=1 collisions_total=2 verdict=widen-hash"
 *
 * That format is perfect for a grep pipeline scraping a stack of
 * nightly log files: a single regex extracts every field.
 *
 * It is the WRONG shape for an analytics pipeline whose ingest stage
 * expects strict JSON. A pipeline ingesting per-tag log lines into a
 * time-series database wants:
 *
 *   - typed integer fields (so a string-parsed "collisions=0" doesn't
 *     accidentally land as a string "0" instead of a numeric 0);
 *   - the verdict as an enum string (so the dashboard's verdict
 *     filter doesn't have to regex-extract from a flat sentence);
 *   - the per-transition entries as their own typed entries so a
 *     per-epoch pivot is one .filter() away;
 *   - a single roll-up entry tagged separately from the per-epoch
 *     entries so the dashboard's "current batch verdict" widget
 *     reads from a known position.
 *
 * This module is the JSON companion. Given a
 * `AnonymiseKeyRotateBulkCliSummary` (already produced by the cron
 * tick), it returns a typed array of entries shaped for direct
 * `JSON.stringify`:
 *
 *   {
 *     transitions: [
 *       { tag: '[key-rotate epoch=secret-2022->secret-2023]',
 *         fromEpoch: 0, toEpoch: 1,
 *         fromEpochLabel: 'secret-2022', toEpochLabel: 'secret-2023',
 *         patients: 14, reshuffled: 14, collisions: 0,
 *         verdict: 'ship-safe' },
 *       ...
 *     ],
 *     batch: { tag: '[key-rotate-bulk]', epochs: 4, transitions: 3,
 *              patients: 14, noOpTransitions: 1, collisionsTotal: 2,
 *              verdict: 'widen-hash' }
 *   }
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - AnonymiseKeyRotateBulkCliSummary (input)
 *   - AnonymiseKeyRotateCliVerdict (enum)
 */

import type {
  AnonymiseKeyRotateBulkCliSummary,
  AnonymiseKeyRotateBulkTransitionSummary,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary';
import type { AnonymiseKeyRotateCliVerdict } from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary';

export interface AnonymiseKeyRotateBulkCliSummaryJsonTransitionEntry {
  /** Per-transition log tag (mirrors the line's leading tag). */
  tag: string;
  /** 0-based source epoch index. */
  fromEpoch: number;
  /** 0-based target epoch index. */
  toEpoch: number;
  /** Source epoch label. */
  fromEpochLabel: string;
  /** Target epoch label. */
  toEpochLabel: string;
  /** Total patients in the cohort. */
  patients: number;
  /** Patients whose pseudonym changed across this transition. */
  reshuffled: number;
  /** Collisions detected in this transition. */
  collisions: number;
  /** Per-transition verdict. */
  verdict: AnonymiseKeyRotateCliVerdict;
}

export interface AnonymiseKeyRotateBulkCliSummaryJsonBatchEntry {
  /** Batch log tag (mirrors the batch line's leading tag). */
  tag: string;
  /** Number of secret epochs in the chain. */
  epochs: number;
  /** Number of transitions emitted. */
  transitions: number;
  /** Total patients in the cohort. */
  patients: number;
  /** Number of transitions whose verdict was 'no-op'. */
  noOpTransitions: number;
  /** Sum of collisions across every transition. */
  collisionsTotal: number;
  /** Batch verdict (worst-wins precedence). */
  verdict: AnonymiseKeyRotateCliVerdict;
}

export interface AnonymiseKeyRotateBulkCliSummaryJson {
  /**
   * Per-transition entries, in epoch order (oldest -> newest). One
   * entry per transition (NOT affected by the underlying
   * suppressNoOpTransitions flag — that flag only suppresses the
   * formatted log line, never the structured datum).
   */
  transitions: AnonymiseKeyRotateBulkCliSummaryJsonTransitionEntry[];
  /**
   * Single roll-up entry tagged separately from the per-epoch entries
   * so the dashboard's "current batch verdict" widget reads from a
   * known position.
   */
  batch: AnonymiseKeyRotateBulkCliSummaryJsonBatchEntry;
}

export interface AnonymiseKeyRotateBulkCliSummaryJsonOptions {
  /**
   * Optional override for the per-transition log tag. When unset,
   * inherits the underlying summary's tag (the tag the cli-summary
   * module computed from `transitionTag` + epoch labels).
   */
  transitionTagOverride?: (
    entry: AnonymiseKeyRotateBulkTransitionSummary,
  ) => string;
  /**
   * Optional override for the batch tag. When unset, reads from
   * the underlying summary's batchLine first token.
   */
  batchTagOverride?: string;
}

/**
 * Extract the leading tag (everything inside the first `[...]` plus
 * the bracket) from a cli summary line. The cli-summary module
 * always emits the tag as the first token wrapped in brackets, so a
 * tight regex anchored at the start of the string is safe.
 *
 * Falls back to '[key-rotate]' or '[key-rotate-bulk]' when the line
 * is malformed (defence in depth; the underlying module always
 * produces well-formed lines, but a future formatter change should
 * not crash the JSON converter).
 */
function extractLeadingTag(line: string, fallback: string): string {
  const m = /^(\[[^\]]+\])/.exec(line);
  return m ? m[1]! : fallback;
}

/**
 * Convert an `AnonymiseKeyRotateBulkCliSummary` into the JSON-shaped
 * `AnonymiseKeyRotateBulkCliSummaryJson`.
 *
 * Pure / deterministic.
 */
export function summarizeAnonymiseKeyRotationBulkForCliJson(
  summary: AnonymiseKeyRotateBulkCliSummary,
  options: AnonymiseKeyRotateBulkCliSummaryJsonOptions = {},
): AnonymiseKeyRotateBulkCliSummaryJson {
  const transitions: AnonymiseKeyRotateBulkCliSummaryJsonTransitionEntry[] =
    summary.summaries.map((s) => {
      const tag =
        options.transitionTagOverride !== undefined
          ? options.transitionTagOverride(s)
          : extractLeadingTag(s.cli.line, '[key-rotate]');
      return {
        tag,
        fromEpoch: s.fromEpoch,
        toEpoch: s.toEpoch,
        fromEpochLabel: s.fromEpochLabel,
        toEpochLabel: s.toEpochLabel,
        patients: s.cli.patients,
        reshuffled: s.cli.reshuffled,
        collisions: s.cli.collisions,
        verdict: s.cli.verdict,
      };
    });

  const batchTag =
    options.batchTagOverride ??
    extractLeadingTag(summary.batchLine, '[key-rotate-bulk]');

  const batch: AnonymiseKeyRotateBulkCliSummaryJsonBatchEntry = {
    tag: batchTag,
    epochs: summary.epochCount,
    transitions: summary.transitionCount,
    patients: summary.patients,
    noOpTransitions: summary.noOpTransitionCount,
    collisionsTotal: summary.collisionsTotal,
    verdict: summary.verdict,
  };

  return { transitions, batch };
}

/**
 * Convenience: produce a JSON.stringify-ready single-line NDJSON
 * payload (one JSON object per line: every transition first, then
 * the batch). Pipelines that ingest NDJSON streams can pipe the
 * output of this helper straight into their bus.
 *
 * Pure / deterministic.
 */
export function joinAnonymiseKeyRotateBulkCliSummaryJsonNdjson(
  json: AnonymiseKeyRotateBulkCliSummaryJson,
): string {
  const lines: string[] = [];
  for (const t of json.transitions) {
    lines.push(JSON.stringify({ kind: 'transition', ...t }));
  }
  lines.push(JSON.stringify({ kind: 'batch', ...json.batch }));
  return lines.join('\n');
}

/**
 * Convenience: extract just the transitions whose verdict matches a
 * given filter. Useful for the dashboard's "show me every transition
 * that flagged widen-hash" view.
 *
 * Pure / deterministic.
 */
export function filterAnonymiseKeyRotateBulkCliSummaryJsonByVerdict(
  json: AnonymiseKeyRotateBulkCliSummaryJson,
  verdict: AnonymiseKeyRotateCliVerdict,
): AnonymiseKeyRotateBulkCliSummaryJsonTransitionEntry[] {
  return json.transitions.filter((t) => t.verdict === verdict);
}

/**
 * Convenience: roll up multiple bulk JSON summaries into a single
 * combined summary suitable for a multi-cohort dashboard (e.g. one
 * cohort per medical specialty in the same nightly cron run).
 *
 * The combined transitions array is the concatenation of all input
 * transitions arrays (preserves per-cohort order; cohort tags are
 * expected to be in the transition tags themselves). The combined
 * batch entry sums epochs / transitions / patients / collisions
 * and picks the worst batch verdict using the same precedence
 * (widen-hash > empty-cohort > ship-safe > no-op).
 *
 * The combined batch tag defaults to '[key-rotate-bulk-batch]'.
 *
 * Pure / deterministic.
 */
export function combineAnonymiseKeyRotateBulkCliSummaryJson(
  summaries: AnonymiseKeyRotateBulkCliSummaryJson[],
  combinedBatchTag = '[key-rotate-bulk-batch]',
): AnonymiseKeyRotateBulkCliSummaryJson {
  const transitions = summaries.flatMap((s) => s.transitions);

  let epochs = 0;
  let transitionsCount = 0;
  let patients = 0;
  let noOpTransitions = 0;
  let collisionsTotal = 0;
  let verdict: AnonymiseKeyRotateCliVerdict = 'no-op';

  // Worst-wins verdict precedence.
  const verdictRank: Record<AnonymiseKeyRotateCliVerdict, number> = {
    'widen-hash': 4,
    'empty-cohort': 3,
    'ship-safe': 2,
    'no-op': 1,
  };

  for (const s of summaries) {
    epochs += s.batch.epochs;
    transitionsCount += s.batch.transitions;
    patients += s.batch.patients;
    noOpTransitions += s.batch.noOpTransitions;
    collisionsTotal += s.batch.collisionsTotal;
    if (verdictRank[s.batch.verdict] > verdictRank[verdict]) {
      verdict = s.batch.verdict;
    }
  }

  // Empty input -> stable default shape (zero everywhere, no-op).
  if (summaries.length === 0) {
    return {
      transitions: [],
      batch: {
        tag: combinedBatchTag,
        epochs: 0,
        transitions: 0,
        patients: 0,
        noOpTransitions: 0,
        collisionsTotal: 0,
        verdict: 'no-op',
      },
    };
  }

  return {
    transitions,
    batch: {
      tag: combinedBatchTag,
      epochs,
      transitions: transitionsCount,
      patients,
      noOpTransitions,
      collisionsTotal,
      verdict,
    },
  };
}
