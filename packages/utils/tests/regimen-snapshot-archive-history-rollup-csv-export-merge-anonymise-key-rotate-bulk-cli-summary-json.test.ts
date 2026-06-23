import { describe, it, expect } from 'vitest';
import {
  summarizeAnonymiseKeyRotationBulkForCliJson,
  joinAnonymiseKeyRotateBulkCliSummaryJsonNdjson,
  filterAnonymiseKeyRotateBulkCliSummaryJsonByVerdict,
  combineAnonymiseKeyRotateBulkCliSummaryJson,
  type AnonymiseKeyRotateBulkCliSummaryJson,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json';
import type {
  AnonymiseKeyRotateBulkCliSummary,
  AnonymiseKeyRotateBulkTransitionSummary,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary';
import type { AnonymiseKeyRotateCliVerdict } from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary';

// Test helpers --------------------------------------------------------

function transition(
  fromEpoch: number,
  fromLabel: string,
  toLabel: string,
  patients: number,
  reshuffled: number,
  collisions: number,
  verdict: AnonymiseKeyRotateCliVerdict,
  tagOverride?: string,
): AnonymiseKeyRotateBulkTransitionSummary {
  const tag = tagOverride ?? `[key-rotate epoch=${fromLabel}->${toLabel}]`;
  return {
    fromEpoch,
    toEpoch: fromEpoch + 1,
    fromEpochLabel: fromLabel,
    toEpochLabel: toLabel,
    cli: {
      patients,
      reshuffled,
      collisions,
      verdict,
      line: `${tag} patients=${patients} reshuffled=${reshuffled} collisions=${collisions} verdict=${verdict}`,
    },
  };
}

function buildSummary(
  summaries: AnonymiseKeyRotateBulkTransitionSummary[],
  options: {
    epochCount?: number;
    transitionCount?: number;
    patients?: number;
    noOp?: number;
    collisionsTotal?: number;
    verdict?: AnonymiseKeyRotateCliVerdict;
    batchTag?: string;
  } = {},
): AnonymiseKeyRotateBulkCliSummary {
  const epochCount = options.epochCount ?? summaries.length + 1;
  const transitionCount = options.transitionCount ?? summaries.length;
  const patients = options.patients ?? (summaries[0]?.cli.patients ?? 0);
  const noOp =
    options.noOp ??
    summaries.filter((s) => s.cli.verdict === 'no-op').length;
  const collisionsTotal =
    options.collisionsTotal ??
    summaries.reduce((a, s) => a + s.cli.collisions, 0);
  const verdict = options.verdict ?? 'no-op';
  const batchTag = options.batchTag ?? '[key-rotate-bulk]';
  return {
    transitionLines: summaries.map((s) => s.cli.line),
    batchLine: `${batchTag} epochs=${epochCount} transitions=${transitionCount} patients=${patients} noop_transitions=${noOp} collisions_total=${collisionsTotal} verdict=${verdict}`,
    summaries,
    epochCount,
    transitionCount,
    patients,
    noOpTransitionCount: noOp,
    collisionsTotal,
    verdict,
  };
}

// Happy path tests ---------------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCliJson — happy path', () => {
  it('converts a three-transition summary into a typed JSON shape', () => {
    const summary = buildSummary(
      [
        transition(0, 'secret-2022', 'secret-2023', 14, 14, 0, 'ship-safe'),
        transition(1, 'secret-2023', 'secret-2024', 14, 0, 0, 'no-op'),
        transition(2, 'secret-2024', 'secret-2025', 14, 14, 2, 'widen-hash'),
      ],
      {
        epochCount: 4,
        transitionCount: 3,
        patients: 14,
        noOp: 1,
        collisionsTotal: 2,
        verdict: 'widen-hash',
      },
    );
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.transitions).toHaveLength(3);
    expect(json.transitions[0]).toEqual({
      tag: '[key-rotate epoch=secret-2022->secret-2023]',
      fromEpoch: 0,
      toEpoch: 1,
      fromEpochLabel: 'secret-2022',
      toEpochLabel: 'secret-2023',
      patients: 14,
      reshuffled: 14,
      collisions: 0,
      verdict: 'ship-safe',
    });
    expect(json.transitions[2]!.verdict).toBe('widen-hash');
    expect(json.transitions[2]!.collisions).toBe(2);
  });

  it('emits a typed batch entry from the underlying summary', () => {
    const summary = buildSummary(
      [transition(0, 'a', 'b', 7, 7, 0, 'ship-safe')],
      {
        epochCount: 2,
        transitionCount: 1,
        patients: 7,
        verdict: 'ship-safe',
      },
    );
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.batch).toEqual({
      tag: '[key-rotate-bulk]',
      epochs: 2,
      transitions: 1,
      patients: 7,
      noOpTransitions: 0,
      collisionsTotal: 0,
      verdict: 'ship-safe',
    });
  });

  it('round-trips a no-op-only chain', () => {
    const summary = buildSummary(
      [
        transition(0, 'a', 'b', 5, 0, 0, 'no-op'),
        transition(1, 'b', 'c', 5, 0, 0, 'no-op'),
      ],
      { patients: 5, verdict: 'no-op' },
    );
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.transitions.every((t) => t.verdict === 'no-op')).toBe(true);
    expect(json.batch.verdict).toBe('no-op');
    expect(json.batch.noOpTransitions).toBe(2);
  });

  it('round-trips empty-cohort with zero transitions', () => {
    const summary = buildSummary([], {
      epochCount: 1,
      transitionCount: 0,
      patients: 0,
      verdict: 'empty-cohort',
    });
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.transitions).toEqual([]);
    expect(json.batch.verdict).toBe('empty-cohort');
    expect(json.batch.patients).toBe(0);
  });

  it('preserves epoch labels with special characters', () => {
    const summary = buildSummary([
      transition(0, '2022-Q4', '2023-Q1', 3, 3, 0, 'ship-safe'),
    ]);
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.transitions[0]!.fromEpochLabel).toBe('2022-Q4');
    expect(json.transitions[0]!.toEpochLabel).toBe('2023-Q1');
    expect(json.transitions[0]!.tag).toBe(
      '[key-rotate epoch=2022-Q4->2023-Q1]',
    );
  });
});

// Tag override tests --------------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCliJson — tag overrides', () => {
  it('honours transitionTagOverride callback', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 5, 5, 0, 'ship-safe'),
      transition(1, 'b', 'c', 5, 0, 0, 'no-op'),
    ]);
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary, {
      transitionTagOverride: (s) =>
        `[cardiology epoch=${s.fromEpochLabel}->${s.toEpochLabel}]`,
    });
    expect(json.transitions[0]!.tag).toBe('[cardiology epoch=a->b]');
    expect(json.transitions[1]!.tag).toBe('[cardiology epoch=b->c]');
  });

  it('honours batchTagOverride string', () => {
    const summary = buildSummary(
      [transition(0, 'a', 'b', 3, 3, 0, 'ship-safe')],
      { batchTag: '[key-rotate-bulk]' },
    );
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary, {
      batchTagOverride: '[cardiology-batch]',
    });
    expect(json.batch.tag).toBe('[cardiology-batch]');
  });

  it('inherits batch tag from batchLine when no override supplied', () => {
    const summary = buildSummary(
      [transition(0, 'a', 'b', 3, 3, 0, 'ship-safe')],
      { batchTag: '[custom-bulk]' },
    );
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.batch.tag).toBe('[custom-bulk]');
  });

  it('falls back to default tag when a transition line is malformed', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 3, 3, 0, 'ship-safe'),
    ]);
    // Mutate the line shape so the regex fails to extract a tag.
    summary.summaries[0]!.cli.line = 'no-leading-tag-here verdict=ship-safe';
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.transitions[0]!.tag).toBe('[key-rotate]');
  });

  it('falls back to default batch tag when batchLine is malformed', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 3, 3, 0, 'ship-safe'),
    ]);
    summary.batchLine = 'malformed batch line';
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(json.batch.tag).toBe('[key-rotate-bulk]');
  });
});

// NDJSON serialiser tests --------------------------------------------

describe('joinAnonymiseKeyRotateBulkCliSummaryJsonNdjson', () => {
  it('emits one JSON object per line, transitions first then batch', () => {
    const summary = buildSummary(
      [
        transition(0, 'a', 'b', 4, 4, 0, 'ship-safe'),
        transition(1, 'b', 'c', 4, 0, 0, 'no-op'),
      ],
      { patients: 4, verdict: 'ship-safe' },
    );
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    const ndjson = joinAnonymiseKeyRotateBulkCliSummaryJsonNdjson(json);
    const lines = ndjson.split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      kind: 'transition',
      fromEpoch: 0,
      verdict: 'ship-safe',
    });
    expect(JSON.parse(lines[1]!)).toMatchObject({
      kind: 'transition',
      fromEpoch: 1,
      verdict: 'no-op',
    });
    expect(JSON.parse(lines[2]!)).toMatchObject({
      kind: 'batch',
      verdict: 'ship-safe',
    });
  });

  it('emits a single-line NDJSON for empty-cohort chains', () => {
    const summary = buildSummary([], { patients: 0, verdict: 'empty-cohort' });
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    const ndjson = joinAnonymiseKeyRotateBulkCliSummaryJsonNdjson(json);
    const lines = ndjson.split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).kind).toBe('batch');
  });

  it('produces every line as parseable JSON', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 7, 7, 0, 'ship-safe'),
      transition(1, 'b', 'c', 7, 0, 0, 'no-op'),
      transition(2, 'c', 'd', 7, 7, 3, 'widen-hash'),
    ]);
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    const ndjson = joinAnonymiseKeyRotateBulkCliSummaryJsonNdjson(json);
    for (const line of ndjson.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// Filter helper tests ------------------------------------------------

describe('filterAnonymiseKeyRotateBulkCliSummaryJsonByVerdict', () => {
  let json: AnonymiseKeyRotateBulkCliSummaryJson;

  it('returns only matching transitions', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 5, 5, 0, 'ship-safe'),
      transition(1, 'b', 'c', 5, 0, 0, 'no-op'),
      transition(2, 'c', 'd', 5, 5, 2, 'widen-hash'),
    ]);
    json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    const widen = filterAnonymiseKeyRotateBulkCliSummaryJsonByVerdict(
      json,
      'widen-hash',
    );
    expect(widen).toHaveLength(1);
    expect(widen[0]!.fromEpochLabel).toBe('c');
  });

  it('returns empty array when no transitions match', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 5, 5, 0, 'ship-safe'),
    ]);
    json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(
      filterAnonymiseKeyRotateBulkCliSummaryJsonByVerdict(json, 'widen-hash'),
    ).toEqual([]);
  });

  it('handles empty-cohort summaries gracefully', () => {
    const summary = buildSummary([], { patients: 0, verdict: 'empty-cohort' });
    json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    expect(
      filterAnonymiseKeyRotateBulkCliSummaryJsonByVerdict(json, 'no-op'),
    ).toEqual([]);
  });
});

// Combine multi-cohort tests ------------------------------------------

describe('combineAnonymiseKeyRotateBulkCliSummaryJson', () => {
  it('flattens transitions across cohorts in order', () => {
    const a = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary([
        transition(0, 'a', 'b', 4, 4, 0, 'ship-safe', '[cardio a->b]'),
      ]),
    );
    const b = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary([
        transition(0, 'a', 'b', 6, 6, 0, 'ship-safe', '[gastro a->b]'),
      ]),
    );
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson([a, b]);
    expect(combined.transitions).toHaveLength(2);
    expect(combined.transitions[0]!.tag).toBe('[cardio a->b]');
    expect(combined.transitions[1]!.tag).toBe('[gastro a->b]');
  });

  it('sums per-cohort batch totals', () => {
    const a = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [
          transition(0, 'a', 'b', 4, 4, 0, 'ship-safe'),
          transition(1, 'b', 'c', 4, 0, 0, 'no-op'),
        ],
        {
          epochCount: 3,
          transitionCount: 2,
          patients: 4,
          noOp: 1,
          verdict: 'ship-safe',
        },
      ),
    );
    const b = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 6, 6, 0, 'ship-safe')],
        {
          epochCount: 2,
          transitionCount: 1,
          patients: 6,
          verdict: 'ship-safe',
        },
      ),
    );
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson([a, b]);
    expect(combined.batch.epochs).toBe(5);
    expect(combined.batch.transitions).toBe(3);
    expect(combined.batch.patients).toBe(10);
    expect(combined.batch.noOpTransitions).toBe(1);
  });

  it('picks the worst cohort verdict (widen-hash trumps ship-safe)', () => {
    const a = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 4, 4, 0, 'ship-safe')],
        { verdict: 'ship-safe' },
      ),
    );
    const b = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 4, 4, 3, 'widen-hash')],
        { verdict: 'widen-hash', collisionsTotal: 3 },
      ),
    );
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson([a, b]);
    expect(combined.batch.verdict).toBe('widen-hash');
    expect(combined.batch.collisionsTotal).toBe(3);
  });

  it('picks empty-cohort when present and no widen-hash', () => {
    const a = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 4, 4, 0, 'ship-safe')],
        { verdict: 'ship-safe' },
      ),
    );
    const b = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary([], { patients: 0, verdict: 'empty-cohort' }),
    );
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson([a, b]);
    expect(combined.batch.verdict).toBe('empty-cohort');
  });

  it('returns no-op verdict for entirely-no-op cohorts', () => {
    const a = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 4, 0, 0, 'no-op')],
        { verdict: 'no-op', noOp: 1 },
      ),
    );
    const b = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 6, 0, 0, 'no-op')],
        { verdict: 'no-op', noOp: 1 },
      ),
    );
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson([a, b]);
    expect(combined.batch.verdict).toBe('no-op');
  });

  it('returns a stable empty batch shape for zero cohorts', () => {
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson([]);
    expect(combined.transitions).toEqual([]);
    expect(combined.batch).toEqual({
      tag: '[key-rotate-bulk-batch]',
      epochs: 0,
      transitions: 0,
      patients: 0,
      noOpTransitions: 0,
      collisionsTotal: 0,
      verdict: 'no-op',
    });
  });

  it('honours combined batch tag override', () => {
    const a = summarizeAnonymiseKeyRotationBulkForCliJson(
      buildSummary(
        [transition(0, 'a', 'b', 4, 4, 0, 'ship-safe')],
        { verdict: 'ship-safe' },
      ),
    );
    const combined = combineAnonymiseKeyRotateBulkCliSummaryJson(
      [a],
      '[multi-clinic-bulk]',
    );
    expect(combined.batch.tag).toBe('[multi-clinic-bulk]');
  });
});

// Round-trip safety tests --------------------------------------------

describe('summarizeAnonymiseKeyRotationBulkForCliJson — round-trip safety', () => {
  it('every field is JSON.stringify clean (no Map, no Date, no undefined)', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 4, 4, 0, 'ship-safe'),
      transition(1, 'b', 'c', 4, 0, 0, 'no-op'),
    ]);
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    const roundTripped = JSON.parse(JSON.stringify(json));
    expect(roundTripped).toEqual(json);
  });

  it('reshuffled + collisions remain numeric after parse', () => {
    const summary = buildSummary([
      transition(0, 'a', 'b', 14, 7, 2, 'widen-hash'),
    ]);
    const json = summarizeAnonymiseKeyRotationBulkForCliJson(summary);
    const round = JSON.parse(JSON.stringify(json));
    expect(typeof round.transitions[0].reshuffled).toBe('number');
    expect(typeof round.transitions[0].collisions).toBe('number');
    expect(typeof round.batch.patients).toBe('number');
  });
});
