/**
 * Dose export CSV import round-trip validator — summary text.
 *
 * `dose-export-csv-import-roundtrip-validator` already ships a
 * one-line `summarizeRoundtripResult`. That's the right shape for a
 * toast confirmation or a cron log header line, but the on-call
 * engineer reviewing a CI artifact at 2am or the QA tooling
 * scanning a pipeline log wants more than one line:
 *
 *   - which doseIds landed in each risk tier (sample, not exhaustive)
 *   - the parser-skip reasons (top reasons grouped)
 *   - a quick visual delimiter so the block is easy to grep
 *
 * This module is the multi-line text companion to summarizeRoundtripResult
 * and a sibling to the HTML render. It produces a plain-text block
 * suitable for cron logs, CI artifacts, terminal stdout, or a code-
 * block fenced into a Slack message:
 *
 *   ====================================================
 *   DOSE ROUND-TRIP REVIEW
 *   ----------------------------------------------------
 *   42 unchanged, 5 diffs, 0 added, 1 removed, 0 parser skips
 *   ----------------------------------------------------
 *   STRUCTURAL (1):
 *     - dose-abc123
 *   STATUS EDIT (2):
 *     - dose-def456
 *     - dose-ghi789
 *   NOTE ONLY (2):
 *     - dose-jkl012, dose-mno345
 *   ----------------------------------------------------
 *   Removed: dose-removed-1
 *   ====================================================
 *
 * Sample doseIds are capped per tier so the block stays readable
 * even for very large round-trips; the caller can configure the cap.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  DoseRoundtripDiff,
  DoseRoundtripValidateResult,
} from './dose-export-csv-import-roundtrip-validator';

export interface DoseRoundtripSummaryTextOptions {
  /**
   * Maximum doseIds shown per risk tier. Default 5. Extras collapse
   * to a "...and N more" line. Pass Infinity for the unbounded list.
   */
  samplesPerTier?: number;
  /**
   * Maximum doseIds shown in the added / removed lists. Default 5.
   * Extras collapse to "...and N more".
   */
  samplesPerAdjacent?: number;
  /**
   * Maximum parser-skip reasons shown (grouped by reason). Default 5.
   * Extras collapse to "...and N more".
   */
  samplesPerSkipReason?: number;
  /**
   * Include the top-level visual delimiter (the ===== rows). Default
   * true. Disable when embedding inside a larger text block.
   */
  includeDelimiter?: boolean;
  /**
   * Single-line title for the block header. Default "DOSE ROUND-TRIP REVIEW".
   * Pass empty string to suppress the title row entirely.
   */
  title?: string;
}

export interface DoseRoundtripSummaryTextResult {
  /** Full multi-line summary text (LF-separated). */
  text: string;
  /** Number of distinct lines in the text body. */
  lineCount: number;
  /** Per-tier sample doseIds returned, for caller inspection. */
  tierSamples: Record<DoseRoundtripDiff['risk'], string[]>;
}

const TIER_LABEL: Record<DoseRoundtripDiff['risk'], string> = {
  structural: 'STRUCTURAL',
  mixed: 'MIXED',
  'status-edit': 'STATUS EDIT',
  'note-only': 'NOTE ONLY',
};

const TIER_PRIORITY: DoseRoundtripDiff['risk'][] = [
  'structural',
  'mixed',
  'status-edit',
  'note-only',
];

const DELIMITER_HEAVY = '='.repeat(52);
const DELIMITER_LIGHT = '-'.repeat(52);

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function buildSampleList(
  ids: string[],
  cap: number,
): { lines: string[]; sampled: string[] } {
  const cappedSampleCount = Math.min(ids.length, Math.max(0, cap));
  const sampled = ids.slice(0, cappedSampleCount);
  if (sampled.length === 0) return { lines: [], sampled };
  const lines: string[] = [];
  // Note-only tier and adjacent lists often have lots of short ids;
  // pack 2 per line for readability when there are several.
  if (sampled.length <= 3) {
    for (const id of sampled) lines.push(`  - ${id}`);
  } else {
    for (let i = 0; i < sampled.length; i += 2) {
      const a = sampled[i]!;
      const b = sampled[i + 1];
      if (b !== undefined) lines.push(`  - ${a}, ${b}`);
      else lines.push(`  - ${a}`);
    }
  }
  const overflow = ids.length - sampled.length;
  if (overflow > 0) {
    lines.push(`  ...and ${overflow} more`);
  }
  return { lines, sampled };
}

function buildTierBlock(
  tier: DoseRoundtripDiff['risk'],
  diffs: DoseRoundtripDiff[],
  cap: number,
): { lines: string[]; sampled: string[] } {
  if (diffs.length === 0) return { lines: [], sampled: [] };
  const header = `${TIER_LABEL[tier]} (${diffs.length}):`;
  const ids = diffs.map((d) => d.doseId);
  const { lines: bodyLines, sampled } = buildSampleList(ids, cap);
  return { lines: [header, ...bodyLines], sampled };
}

function buildAdjacentBlock(
  label: string,
  ids: string[],
  cap: number,
): string[] {
  if (ids.length === 0) return [];
  const header = `${label} (${ids.length}):`;
  const { lines } = buildSampleList(ids, cap);
  return [header, ...lines];
}

function buildSkipBlock(
  parseSkipped: DoseRoundtripValidateResult['parseSkipped'],
  cap: number,
): string[] {
  if (parseSkipped.length === 0) return [];
  // Group by reason for a compact summary; show counts then a sample
  // row per top reason.
  const grouped = new Map<string, number[]>();
  for (const s of parseSkipped) {
    const list = grouped.get(s.reason) ?? [];
    list.push(s.row);
    grouped.set(s.reason, list);
  }
  const sortedReasons = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  const lines: string[] = [`Parser skipped (${parseSkipped.length}):`];
  const cappedReasonCount = Math.min(sortedReasons.length, Math.max(0, cap));
  for (let i = 0; i < cappedReasonCount; i++) {
    const [reason, rows] = sortedReasons[i]!;
    const sampleRows = rows.slice(0, 3).join(', ');
    const moreRows = rows.length > 3 ? `, +${rows.length - 3} more` : '';
    lines.push(`  - ${reason} [${rows.length}x; rows ${sampleRows}${moreRows}]`);
  }
  const remainder = sortedReasons.length - cappedReasonCount;
  if (remainder > 0) lines.push(`  ...and ${remainder} more reasons`);
  return lines;
}

/**
 * Render a DoseRoundtripValidateResult as a multi-line plain-text
 * block suitable for cron logs, CI artifacts, terminal output, or a
 * Slack code-fenced message.
 *
 * Output is deterministic — same input produces byte-identical text
 * across runs. Caller-facing controls are sample caps (per tier,
 * per adjacent list, per skip reason) and the delimiter / title
 * toggles.
 */
export function summarizeRoundtripResultText(
  result: DoseRoundtripValidateResult,
  options: DoseRoundtripSummaryTextOptions = {},
): DoseRoundtripSummaryTextResult {
  const samplesPerTier = options.samplesPerTier ?? 5;
  const samplesPerAdjacent = options.samplesPerAdjacent ?? 5;
  const samplesPerSkipReason = options.samplesPerSkipReason ?? 5;
  const includeDelimiter = options.includeDelimiter ?? true;
  const title = options.title ?? 'DOSE ROUND-TRIP REVIEW';

  const diffCount = result.diffs.length;
  const skipNoun = pluralize(result.parseSkipped.length, 'skip', 'skips');
  const diffNoun = pluralize(diffCount, 'diff', 'diffs');
  const oneLine =
    `${result.unchangedCount} unchanged, ` +
    `${diffCount} ${diffNoun}, ` +
    `${result.addedIds.length} added, ` +
    `${result.removedIds.length} removed, ` +
    `${result.parseSkipped.length} parser ${skipNoun}`;

  const byRisk: Record<DoseRoundtripDiff['risk'], DoseRoundtripDiff[]> = {
    structural: [],
    mixed: [],
    'status-edit': [],
    'note-only': [],
  };
  for (const d of result.diffs) byRisk[d.risk].push(d);

  const tierSamples: Record<DoseRoundtripDiff['risk'], string[]> = {
    structural: [],
    mixed: [],
    'status-edit': [],
    'note-only': [],
  };

  const tierBlocks: string[][] = [];
  for (const tier of TIER_PRIORITY) {
    const block = buildTierBlock(tier, byRisk[tier], samplesPerTier);
    tierSamples[tier] = block.sampled;
    if (block.lines.length > 0) tierBlocks.push(block.lines);
  }

  const lines: string[] = [];
  if (includeDelimiter) lines.push(DELIMITER_HEAVY);
  if (title !== '') lines.push(title);
  lines.push(DELIMITER_LIGHT);
  lines.push(oneLine);
  lines.push(DELIMITER_LIGHT);
  if (tierBlocks.length === 0) {
    lines.push('No diffs across any risk tier.');
  } else {
    for (let i = 0; i < tierBlocks.length; i++) {
      lines.push(...tierBlocks[i]!);
    }
  }

  const addedBlock = buildAdjacentBlock('Added', result.addedIds, samplesPerAdjacent);
  const removedBlock = buildAdjacentBlock(
    'Removed',
    result.removedIds,
    samplesPerAdjacent,
  );
  const skipBlock = buildSkipBlock(result.parseSkipped, samplesPerSkipReason);
  if (addedBlock.length > 0 || removedBlock.length > 0 || skipBlock.length > 0) {
    lines.push(DELIMITER_LIGHT);
    if (addedBlock.length > 0) lines.push(...addedBlock);
    if (removedBlock.length > 0) lines.push(...removedBlock);
    if (skipBlock.length > 0) lines.push(...skipBlock);
  }
  if (includeDelimiter) lines.push(DELIMITER_HEAVY);

  return {
    text: lines.join('\n'),
    lineCount: lines.length,
    tierSamples,
  };
}

/**
 * Convenience: emit only the per-tier sample blocks (no header, no
 * delimiter, no parser-skip block). Useful for stitching the per-tier
 * detail into a larger text envelope the caller already builds.
 */
export function summarizeRoundtripTierSamplesText(
  result: DoseRoundtripValidateResult,
  options: Pick<DoseRoundtripSummaryTextOptions, 'samplesPerTier'> = {},
): string {
  const samplesPerTier = options.samplesPerTier ?? 5;
  const byRisk: Record<DoseRoundtripDiff['risk'], DoseRoundtripDiff[]> = {
    structural: [],
    mixed: [],
    'status-edit': [],
    'note-only': [],
  };
  for (const d of result.diffs) byRisk[d.risk].push(d);

  const lines: string[] = [];
  for (const tier of TIER_PRIORITY) {
    const block = buildTierBlock(tier, byRisk[tier], samplesPerTier);
    if (block.lines.length > 0) lines.push(...block.lines);
  }
  return lines.join('\n');
}
