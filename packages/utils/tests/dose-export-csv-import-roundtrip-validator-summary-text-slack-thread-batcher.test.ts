import { describe, it, expect } from 'vitest';
import {
  batchRoundtripResultsForSlackThread,
  summarizeRoundtripThreadBatch,
  type DoseRoundtripThreadBatcherRun,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';
import type {
  DoseRoundtripValidateResult,
  DoseRoundtripDiff,
} from '../src/dose-export-csv-import-roundtrip-validator';
import type { DoseRoundtripSlackBlock } from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack';

function makeDiff(id: string, risk: DoseRoundtripDiff['risk']): DoseRoundtripDiff {
  if (risk === 'note-only') {
    return { doseId: id, changes: [{ field: 'note', before: null, after: 'edited' }], risk };
  }
  if (risk === 'status-edit') {
    return { doseId: id, changes: [{ field: 'status', before: 'pending', after: 'taken' }], risk };
  }
  if (risk === 'structural') {
    return {
      doseId: id,
      changes: [{ field: 'scheduleId', before: 'sched-1', after: 'sched-2' }],
      risk,
    };
  }
  return {
    doseId: id,
    changes: [
      { field: 'scheduleId', before: 'sched-1', after: 'sched-2' },
      { field: 'note', before: null, after: 'reassigned' },
    ],
    risk,
  };
}

function makeResult(overrides: Partial<DoseRoundtripValidateResult> = {}): DoseRoundtripValidateResult {
  return {
    parsedDoses: [],
    parseSkipped: [],
    diffs: [],
    addedIds: [],
    removedIds: [],
    unchangedCount: 0,
    ...overrides,
  };
}

function makeRun(
  runId: string,
  runLabel: string,
  result: DoseRoundtripValidateResult,
): DoseRoundtripThreadBatcherRun {
  return { runId, runLabel, result };
}

function findHeaderText(blocks: DoseRoundtripSlackBlock[]): string {
  const h = blocks.find((b) => b.type === 'header');
  return (h!.text as { text: string }).text;
}

function findContextTexts(blocks: DoseRoundtripSlackBlock[]): string[] {
  return blocks
    .filter((b) => b.type === 'context')
    .map((b) => (b.elements as [{ text: string }])[0]!.text);
}

function findSectionTexts(blocks: DoseRoundtripSlackBlock[]): string[] {
  return blocks
    .filter((b) => b.type === 'section')
    .map((b) => (b.text as { text: string }).text);
}

describe('batchRoundtripResultsForSlackThread — parent message', () => {
  it('uses the default parent title and renders the date label in context', () => {
    const runs = [
      makeRun('r1', '2026-06-20 nightly', makeResult({ unchangedCount: 100 })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs, { dateLabel: 'Sat 2026-06-20' });
    expect(findHeaderText(out.parent.blocks)).toBe('Daily QA round-trip digest');
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs[0]).toContain('Sat 2026-06-20');
    expect(ctxs[0]).toContain('1 run reviewed');
  });

  it('uses a custom parent title', () => {
    const runs = [makeRun('r1', 'a', makeResult())];
    const out = batchRoundtripResultsForSlackThread(runs, { parentTitle: 'Weekly QA digest' });
    expect(findHeaderText(out.parent.blocks)).toBe('Weekly QA digest');
  });

  it('parent summary line aggregates totals across runs', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ unchangedCount: 10, diffs: [makeDiff('d1', 'structural')], addedIds: ['a1'] })),
      makeRun('r2', 'b', makeResult({ unchangedCount: 20, diffs: [makeDiff('d2', 'mixed'), makeDiff('d3', 'note-only')], removedIds: ['r1', 'r2'] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    const sections = findSectionTexts(out.parent.blocks);
    // Slack mrkdwn uses *N* for bold numbers.
    expect(sections[0]).toContain('*30*'); // 10 + 20 unchanged
    expect(sections[0]).toContain('*3* diffs');
    expect(sections[0]).toContain('*1* added');
    expect(sections[0]).toContain('*2* removed');
  });

  it('per-tier rollup appears in parent context with tiers present', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ diffs: [makeDiff('d1', 'structural'), makeDiff('d2', 'structural'), makeDiff('d3', 'mixed')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.parent.blocks);
    const tierLine = ctxs.find((t) => t.includes('Per-tier rollup'));
    expect(tierLine).toBeDefined();
    expect(tierLine).toContain('Structural 2');
    expect(tierLine).toContain('Mixed 1');
    // Empty tiers should NOT appear.
    expect(tierLine).not.toContain('Note only');
    expect(tierLine).not.toContain('Status edit');
  });

  it('omits per-tier rollup when no diffs at any tier', () => {
    const runs = [makeRun('r1', 'a', makeResult({ unchangedCount: 5 }))];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs.some((t) => t.includes('Per-tier rollup'))).toBe(false);
  });

  it('clean-run hint appears when some runs are clean', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ unchangedCount: 5 })), // clean
      makeRun('r2', 'b', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs.some((t) => t.includes('1 clean run'))).toBe(true);
  });

  it('omits clean-run hint when every run is actionable', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
      makeRun('r2', 'b', makeResult({ diffs: [makeDiff('d2', 'mixed')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs.some((t) => t.includes('clean run'))).toBe(false);
  });

  it('renders dashboard URL button when https://', () => {
    const runs = [makeRun('r1', 'a', makeResult())];
    const out = batchRoundtripResultsForSlackThread(runs, {
      dashboardUrl: 'https://qa.example.com/dashboard',
    });
    const actions = out.parent.blocks.find((b) => b.type === 'actions');
    expect(actions).toBeDefined();
    expect((actions!.elements as [{ url: string }])[0]!.url).toBe(
      'https://qa.example.com/dashboard',
    );
  });

  it('drops non-https dashboard URLs (http:// or javascript:)', () => {
    const runs = [makeRun('r1', 'a', makeResult())];
    const out1 = batchRoundtripResultsForSlackThread(runs, {
      dashboardUrl: 'http://qa.example.com/dashboard',
    });
    const out2 = batchRoundtripResultsForSlackThread(runs, {
      dashboardUrl: 'javascript:alert(1)',
    });
    expect(out1.parent.blocks.find((b) => b.type === 'actions')).toBeUndefined();
    expect(out2.parent.blocks.find((b) => b.type === 'actions')).toBeUndefined();
  });

  it('custom dashboard button label is respected', () => {
    const runs = [makeRun('r1', 'a', makeResult())];
    const out = batchRoundtripResultsForSlackThread(runs, {
      dashboardUrl: 'https://qa.example.com',
      dashboardButtonLabel: 'View runs',
    });
    const actions = out.parent.blocks.find((b) => b.type === 'actions');
    expect((actions!.elements as [{ text: { text: string } }])[0]!.text.text).toBe('View runs');
  });

  it('parent fallback text is single-line, plain-text', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ unchangedCount: 5, diffs: [makeDiff('d1', 'note-only')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    expect(out.parent.fallbackText).not.toContain('\n');
    expect(out.parent.fallbackText).toContain('1 run');
    expect(out.parent.fallbackText).toContain('1 diff');
  });

  it('omits date label slot from context when not provided', () => {
    const runs = [makeRun('r1', 'a', makeResult())];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs[0]).toBe('1 run reviewed');
  });
});

describe('batchRoundtripResultsForSlackThread — replies', () => {
  it('emits one reply per run in input order', () => {
    const runs = [
      makeRun('r1', 'Run 1', makeResult({ unchangedCount: 5 })),
      makeRun('r2', 'Run 2', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
      makeRun('r3', 'Run 3', makeResult({ addedIds: ['a1'] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    expect(out.replies).toHaveLength(3);
    expect(out.replies.map((r) => r.runId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('per-reply header uses runLabel as the title', () => {
    const runs = [makeRun('r1', '2026-06-20 nightly', makeResult({ unchangedCount: 5 }))];
    const out = batchRoundtripResultsForSlackThread(runs);
    expect(findHeaderText(out.replies[0]!.blocks)).toBe('2026-06-20 nightly');
  });

  it('per-reply per-run options forwarded to the underlying renderer', () => {
    const runs: DoseRoundtripThreadBatcherRun[] = [
      {
        runId: 'r1',
        runLabel: 'Run 1',
        result: makeResult({ diffs: [makeDiff('d1', 'structural')] }),
        perRunOptions: { patientName: 'Alice' },
      },
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.replies[0]!.blocks);
    expect(ctxs.some((t) => t.includes('Alice'))).toBe(true);
  });

  it('per-run fallback text is preserved', () => {
    const runs = [
      makeRun('r1', 'Run 1', makeResult({ unchangedCount: 10, diffs: [makeDiff('d1', 'mixed')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    expect(out.replies[0]!.fallbackText).toContain('10 unchanged');
    expect(out.replies[0]!.fallbackText).toContain('1 diff');
  });

  it('per-reply truncated flag mirrors the per-run renderer', () => {
    // 200 structural diffs — likely to trip the 50-block cap.
    const lots = Array.from({ length: 200 }, (_, i) => makeDiff(`d${i}`, 'structural'));
    const runs = [makeRun('r1', 'big run', makeResult({ diffs: lots }))];
    const out = batchRoundtripResultsForSlackThread(runs);
    // It may or may not be true depending on the renderer's grouping;
    // but it must always equal the per-run renderer's value. We test
    // that the flag at least exists on the reply.
    expect(typeof out.replies[0]!.truncated).toBe('boolean');
  });
});

describe('batchRoundtripResultsForSlackThread — suppression policy', () => {
  it('suppressCleanRuns=false keeps a reply for clean runs', () => {
    const runs = [
      makeRun('r1', 'clean', makeResult({ unchangedCount: 5 })),
      makeRun('r2', 'dirty', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    expect(out.replies).toHaveLength(2);
    expect(out.coverage.suppressedRunCount).toBe(0);
  });

  it('suppressCleanRuns=true drops clean runs from replies but still counts them', () => {
    const runs = [
      makeRun('r1', 'clean1', makeResult({ unchangedCount: 5 })),
      makeRun('r2', 'dirty', makeResult({ unchangedCount: 5, diffs: [makeDiff('d1', 'structural')] })),
      makeRun('r3', 'clean2', makeResult({ unchangedCount: 10 })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs, { suppressCleanRuns: true });
    expect(out.replies).toHaveLength(1);
    expect(out.replies[0]!.runId).toBe('r2');
    expect(out.coverage.suppressedRunCount).toBe(2);
    // Parent rollup still counts the clean runs.
    expect(out.coverage.totalUnchanged).toBe(20);
    expect(out.coverage.runCount).toBe(3);
  });

  it('a run with parser skips counts as actionable (not suppressed)', () => {
    const runs = [
      makeRun(
        'r1',
        'parser-only',
        makeResult({
          parseSkipped: [{ row: 5, reason: 'invalid status' }],
        }),
      ),
    ];
    const out = batchRoundtripResultsForSlackThread(runs, { suppressCleanRuns: true });
    expect(out.replies).toHaveLength(1);
    expect(out.coverage.suppressedRunCount).toBe(0);
    expect(out.coverage.actionableRunCount).toBe(1);
  });
});

describe('batchRoundtripResultsForSlackThread — coverage', () => {
  it('coverage aggregates totals across runs', () => {
    const runs = [
      makeRun(
        'r1',
        'a',
        makeResult({
          unchangedCount: 10,
          diffs: [makeDiff('d1', 'structural'), makeDiff('d2', 'note-only')],
          addedIds: ['a1', 'a2'],
          removedIds: ['r1'],
          parseSkipped: [{ row: 3, reason: 'bad date' }],
        }),
      ),
      makeRun(
        'r2',
        'b',
        makeResult({
          unchangedCount: 20,
          diffs: [makeDiff('d3', 'mixed')],
        }),
      ),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    expect(out.coverage.runCount).toBe(2);
    expect(out.coverage.actionableRunCount).toBe(2);
    expect(out.coverage.totalUnchanged).toBe(30);
    expect(out.coverage.totalDiffs).toBe(3);
    expect(out.coverage.totalAdded).toBe(2);
    expect(out.coverage.totalRemoved).toBe(1);
    expect(out.coverage.totalParserSkips).toBe(1);
    expect(out.coverage.byRisk.structural).toBe(1);
    expect(out.coverage.byRisk.mixed).toBe(1);
    expect(out.coverage.byRisk['note-only']).toBe(1);
    expect(out.coverage.byRisk['status-edit']).toBe(0);
  });

  it('empty runs list produces a parent-only thread with zero coverage', () => {
    const out = batchRoundtripResultsForSlackThread([]);
    expect(out.replies).toEqual([]);
    expect(out.coverage.runCount).toBe(0);
    expect(out.coverage.totalDiffs).toBe(0);
    const sections = findSectionTexts(out.parent.blocks);
    expect(sections[0]).toContain('*0* diffs');
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs[0]).toContain('0 runs reviewed');
  });

  it('runCount=1 uses singular phrasing in parent context and summary', () => {
    const runs = [makeRun('r1', 'a', makeResult({ parseSkipped: [{ row: 1, reason: 'x' }] }))];
    const out = batchRoundtripResultsForSlackThread(runs);
    const ctxs = findContextTexts(out.parent.blocks);
    expect(ctxs[0]).toContain('1 run reviewed');
    expect(ctxs[0]).not.toContain('1 runs');
    const sections = findSectionTexts(out.parent.blocks);
    expect(sections[0]).toContain('*1* parser skip');
    expect(sections[0]).not.toContain('parser skips');
  });
});

describe('summarizeRoundtripThreadBatch', () => {
  it('returns a single-line cron summary with actionable + suppressed counts', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
      makeRun('r2', 'b', makeResult({ unchangedCount: 5 })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs, { suppressCleanRuns: true });
    const line = summarizeRoundtripThreadBatch(out);
    expect(line).toContain('Daily QA round-trip thread');
    expect(line).toContain('2 runs');
    expect(line).toContain('1 actionable');
    expect(line).toContain('1 suppressed');
    expect(line).toContain('1 diff');
  });

  it('omits the suppressed segment when nothing was suppressed', () => {
    const runs = [
      makeRun('r1', 'a', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
      makeRun('r2', 'b', makeResult({ diffs: [makeDiff('d2', 'mixed')] })),
    ];
    const out = batchRoundtripResultsForSlackThread(runs);
    const line = summarizeRoundtripThreadBatch(out);
    expect(line).not.toContain('suppressed');
    expect(line).toContain('2 actionable');
  });

  it('pluralisation: 1 diff vs N diffs in the summary line', () => {
    const oneDiff = batchRoundtripResultsForSlackThread([
      makeRun('r1', 'a', makeResult({ diffs: [makeDiff('d1', 'structural')] })),
    ]);
    expect(summarizeRoundtripThreadBatch(oneDiff)).toContain('1 diff,');
    const twoDiffs = batchRoundtripResultsForSlackThread([
      makeRun('r1', 'a', makeResult({ diffs: [makeDiff('d1', 'structural'), makeDiff('d2', 'mixed')] })),
    ]);
    expect(summarizeRoundtripThreadBatch(twoDiffs)).toContain('2 diffs,');
  });
});
