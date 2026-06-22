/**
 * Dose export CSV import round-trip validator — summary text Slack
 * block-kit companion.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text` ships a
 * multi-line plain-text block for cron logs, CI artifacts, and
 * terminal output. The QA on-call channel in Slack wants the same
 * content as a structured message, NOT a fenced code block — block
 * kit gives us:
 *
 *   - rich headers (mrkdwn-styled bold tier labels)
 *   - per-tier section blocks the on-call can scroll
 *   - action buttons to jump to the adjudication queue
 *   - a divider block between the summary header and the detail tail
 *
 * This module produces a Block Kit BLOCKS array (the structured
 * payload Slack's chat.postMessage / webhook accepts as `blocks`).
 * Pure JSON shape — no network, no Slack SDK dependency, no I/O.
 * The caller serialises and ships.
 *
 * Block Kit reference (subset we use):
 *   - 'header'      — section heading
 *   - 'section'     — block with mrkdwn text body + optional fields
 *   - 'context'     — small footnote / sample doseIds row
 *   - 'divider'     — horizontal rule
 *   - 'actions'     — button row
 *
 * Slack block payload caps (we respect them):
 *   - 50 blocks per message; we cap at 49 to leave room for an
 *     overflow notice block when the result is huge.
 *   - 3000 chars per mrkdwn text field; we sample-cap before render
 *     so we don't trip the limit.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  DoseRoundtripDiff,
  DoseRoundtripValidateResult,
} from './dose-export-csv-import-roundtrip-validator';

export interface DoseRoundtripSlackBlock {
  type: string;
  // Block Kit fields vary by block type; carry through opaquely so
  // callers can pass the array straight to chat.postMessage.
  [key: string]: unknown;
}

export interface DoseRoundtripSlackOptions {
  /** Max doseIds shown per risk tier. Default 5. */
  samplesPerTier?: number;
  /** Max doseIds shown per added/removed list. Default 5. */
  samplesPerAdjacent?: number;
  /** Max reasons shown in the parser-skip block. Default 5. */
  samplesPerSkipReason?: number;
  /** Header text. Default "Dose Round-Trip Review". */
  title?: string;
  /**
   * Patient name surfaced under the header. Empty / undefined skips
   * the per-patient context line.
   */
  patientName?: string;
  /**
   * Optional URL the "Open adjudication queue" button links to. When
   * absent, the actions block is omitted. URL must be a https URL —
   * Slack rejects file:// / javascript: links.
   */
  adjudicationUrl?: string;
  /**
   * Override the action button label. Default "Open adjudication queue".
   */
  adjudicationButtonLabel?: string;
}

export interface DoseRoundtripSlackResult {
  /** Block Kit blocks array. Ready to pass to chat.postMessage. */
  blocks: DoseRoundtripSlackBlock[];
  /** Single-line message fallback (for notifications without rich UI). */
  fallbackText: string;
  /** Block count after capping. */
  blockCount: number;
  /** True when an overflow notice was added because the result exceeded the block cap. */
  truncated: boolean;
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

const TIER_EMOJI: Record<DoseRoundtripDiff['risk'], string> = {
  structural: ':rotating_light:',
  mixed: ':warning:',
  'status-edit': ':pencil2:',
  'note-only': ':memo:',
};

const MAX_BLOCKS_TOTAL = 49; // Slack hard cap is 50; reserve 1 for overflow notice.

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function makeHeader(text: string): DoseRoundtripSlackBlock {
  return { type: 'header', text: { type: 'plain_text', text, emoji: true } };
}

function makeDivider(): DoseRoundtripSlackBlock {
  return { type: 'divider' };
}

function makeSection(mrkdwn: string): DoseRoundtripSlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: mrkdwn },
  };
}

function makeContext(mrkdwn: string): DoseRoundtripSlackBlock {
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: mrkdwn }],
  };
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

function sampleIds(ids: string[], cap: number): { sample: string[]; overflow: number } {
  const cappedSampleCount = Math.min(ids.length, Math.max(0, cap));
  const sample = ids.slice(0, cappedSampleCount);
  return { sample, overflow: ids.length - sample.length };
}

function formatSampleLine(ids: string[], overflow: number): string {
  if (ids.length === 0) return '_no sample_';
  const joined = ids.map((id) => `\`${id}\``).join(', ');
  return overflow > 0 ? `${joined} _…and ${overflow} more_` : joined;
}

function tierBlocks(
  tier: DoseRoundtripDiff['risk'],
  diffs: DoseRoundtripDiff[],
  cap: number,
): DoseRoundtripSlackBlock[] {
  if (diffs.length === 0) return [];
  const ids = diffs.map((d) => d.doseId);
  const { sample, overflow } = sampleIds(ids, cap);
  const titleLine = `${TIER_EMOJI[tier]} *${TIER_LABEL[tier]}* — ${diffs.length} ${pluralize(diffs.length, 'row', 'rows')}`;
  const sampleLine = formatSampleLine(sample, overflow);
  return [makeSection(titleLine), makeContext(`Sample dose ids: ${sampleLine}`)];
}

function adjacentBlocks(label: string, ids: string[], cap: number): DoseRoundtripSlackBlock[] {
  if (ids.length === 0) return [];
  const { sample, overflow } = sampleIds(ids, cap);
  return [
    makeContext(
      `*${label}* (${ids.length}): ${formatSampleLine(sample, overflow)}`,
    ),
  ];
}

function skipBlocks(
  parseSkipped: DoseRoundtripValidateResult['parseSkipped'],
  cap: number,
): DoseRoundtripSlackBlock[] {
  if (parseSkipped.length === 0) return [];
  const grouped = new Map<string, number[]>();
  for (const s of parseSkipped) {
    const list = grouped.get(s.reason) ?? [];
    list.push(s.row);
    grouped.set(s.reason, list);
  }
  const sortedReasons = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  const cappedReasonCount = Math.min(sortedReasons.length, Math.max(0, cap));
  const lines: string[] = [`*Parser skipped* (${parseSkipped.length})`];
  for (let i = 0; i < cappedReasonCount; i++) {
    const [reason, rows] = sortedReasons[i]!;
    const sampleRows = rows.slice(0, 3).join(', ');
    const moreRows = rows.length > 3 ? `, +${rows.length - 3} more` : '';
    lines.push(`• \`${reason}\` [${rows.length}x; rows ${sampleRows}${moreRows}]`);
  }
  const remainder = sortedReasons.length - cappedReasonCount;
  if (remainder > 0) lines.push(`_…and ${remainder} more reasons_`);
  return [makeSection(lines.join('\n'))];
}

function buildHeaderBlocks(
  result: DoseRoundtripValidateResult,
  title: string,
  patientName: string | undefined,
): DoseRoundtripSlackBlock[] {
  const headerBlocks: DoseRoundtripSlackBlock[] = [];
  headerBlocks.push(makeHeader(title));
  if (patientName && patientName.length > 0) {
    headerBlocks.push(makeContext(`Patient: *${patientName}*`));
  }
  const diffCount = result.diffs.length;
  const summary =
    `*${result.unchangedCount}* unchanged · ` +
    `*${diffCount}* ${pluralize(diffCount, 'diff', 'diffs')} · ` +
    `*${result.addedIds.length}* added · ` +
    `*${result.removedIds.length}* removed · ` +
    `*${result.parseSkipped.length}* parser ${pluralize(result.parseSkipped.length, 'skip', 'skips')}`;
  headerBlocks.push(makeSection(summary));
  return headerBlocks;
}

/**
 * Render a DoseRoundtripValidateResult as a Slack Block Kit blocks
 * array. The output is ready to ship as the `blocks` field of a
 * chat.postMessage / incoming-webhook payload. A short fallbackText
 * is also returned for notification context (mobile preview, screen
 * readers).
 *
 * Pure / deterministic. Same input produces byte-identical blocks
 * across runs.
 */
export function summarizeRoundtripResultSlack(
  result: DoseRoundtripValidateResult,
  options: DoseRoundtripSlackOptions = {},
): DoseRoundtripSlackResult {
  const samplesPerTier = options.samplesPerTier ?? 5;
  const samplesPerAdjacent = options.samplesPerAdjacent ?? 5;
  const samplesPerSkipReason = options.samplesPerSkipReason ?? 5;
  const title = options.title ?? 'Dose Round-Trip Review';
  const buttonLabel = options.adjudicationButtonLabel ?? 'Open adjudication queue';

  const headerBlocks = buildHeaderBlocks(result, title, options.patientName);

  const byRisk: Record<DoseRoundtripDiff['risk'], DoseRoundtripDiff[]> = {
    structural: [],
    mixed: [],
    'status-edit': [],
    'note-only': [],
  };
  for (const d of result.diffs) byRisk[d.risk].push(d);

  const tierBodyBlocks: DoseRoundtripSlackBlock[] = [];
  let anyTierRendered = false;
  for (const tier of TIER_PRIORITY) {
    const blocks = tierBlocks(tier, byRisk[tier], samplesPerTier);
    if (blocks.length > 0) {
      if (anyTierRendered) tierBodyBlocks.push(makeDivider());
      for (const b of blocks) tierBodyBlocks.push(b);
      anyTierRendered = true;
    }
  }
  if (!anyTierRendered) {
    tierBodyBlocks.push(makeSection('_No diffs across any risk tier._'));
  }

  const tailBlocks: DoseRoundtripSlackBlock[] = [];
  const adjAdded = adjacentBlocks('Added', result.addedIds, samplesPerAdjacent);
  const adjRemoved = adjacentBlocks('Removed', result.removedIds, samplesPerAdjacent);
  const sk = skipBlocks(result.parseSkipped, samplesPerSkipReason);
  if (adjAdded.length > 0 || adjRemoved.length > 0 || sk.length > 0) {
    tailBlocks.push(makeDivider());
    for (const b of adjAdded) tailBlocks.push(b);
    for (const b of adjRemoved) tailBlocks.push(b);
    for (const b of sk) tailBlocks.push(b);
  }

  if (options.adjudicationUrl && options.adjudicationUrl.startsWith('https://')) {
    tailBlocks.push(makeActions(buttonLabel, options.adjudicationUrl));
  }

  const allBlocks = [
    ...headerBlocks,
    makeDivider(),
    ...tierBodyBlocks,
    ...tailBlocks,
  ];

  let truncated = false;
  let finalBlocks = allBlocks;
  if (allBlocks.length > MAX_BLOCKS_TOTAL) {
    truncated = true;
    finalBlocks = allBlocks.slice(0, MAX_BLOCKS_TOTAL);
    finalBlocks.push(
      makeContext(
        `_…and ${allBlocks.length - MAX_BLOCKS_TOTAL} more block${allBlocks.length - MAX_BLOCKS_TOTAL === 1 ? '' : 's'} truncated to fit Slack's 50-block cap. Open the adjudication queue for the full report._`,
      ),
    );
  }

  const fallbackText =
    `${title}: ${result.unchangedCount} unchanged, ` +
    `${result.diffs.length} ${pluralize(result.diffs.length, 'diff', 'diffs')}, ` +
    `${result.addedIds.length} added, ${result.removedIds.length} removed, ` +
    `${result.parseSkipped.length} parser ${pluralize(result.parseSkipped.length, 'skip', 'skips')}`;

  return {
    blocks: finalBlocks,
    fallbackText,
    blockCount: finalBlocks.length,
    truncated,
  };
}

/**
 * Convenience: render the tier body only (no header, no tail).
 * For callers stitching the tier detail into a wider Slack message
 * that already has its own header.
 */
export function summarizeRoundtripTierSamplesSlack(
  result: DoseRoundtripValidateResult,
  options: Pick<DoseRoundtripSlackOptions, 'samplesPerTier'> = {},
): DoseRoundtripSlackBlock[] {
  const samplesPerTier = options.samplesPerTier ?? 5;
  const byRisk: Record<DoseRoundtripDiff['risk'], DoseRoundtripDiff[]> = {
    structural: [],
    mixed: [],
    'status-edit': [],
    'note-only': [],
  };
  for (const d of result.diffs) byRisk[d.risk].push(d);
  const blocks: DoseRoundtripSlackBlock[] = [];
  let anyRendered = false;
  for (const tier of TIER_PRIORITY) {
    const tb = tierBlocks(tier, byRisk[tier], samplesPerTier);
    if (tb.length > 0) {
      if (anyRendered) blocks.push(makeDivider());
      for (const b of tb) blocks.push(b);
      anyRendered = true;
    }
  }
  return blocks;
}
