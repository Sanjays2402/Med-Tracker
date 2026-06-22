import { describe, it, expect } from 'vitest';
import {
  summarizeRoundtripResultText,
  summarizeRoundtripTierSamplesText,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text';
import type {
  DoseRoundtripValidateResult,
  DoseRoundtripDiff,
} from '../src/dose-export-csv-import-roundtrip-validator';

function makeDiff(
  id: string,
  risk: DoseRoundtripDiff['risk'],
): DoseRoundtripDiff {
  if (risk === 'note-only') {
    return {
      doseId: id,
      changes: [{ field: 'note', before: null, after: 'edited' }],
      risk,
    };
  }
  if (risk === 'status-edit') {
    return {
      doseId: id,
      changes: [{ field: 'status', before: 'pending', after: 'taken' }],
      risk,
    };
  }
  if (risk === 'structural') {
    return {
      doseId: id,
      changes: [
        { field: 'scheduleId', before: 'sched-1', after: 'sched-2' },
      ],
      risk,
    };
  }
  // mixed
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

describe('summarizeRoundtripResultText — clean round-trip', () => {
  it('renders a delimiter block with the one-liner stat row', () => {
    const result = makeResult({ unchangedCount: 42 });
    const out = summarizeRoundtripResultText(result);
    expect(out.text).toContain('DOSE ROUND-TRIP REVIEW');
    expect(out.text).toContain('42 unchanged, 0 diffs, 0 added, 0 removed, 0 parser skips');
    expect(out.text).toContain('No diffs across any risk tier.');
    expect(out.text.split('\n')[0]).toBe('='.repeat(52));
    expect(out.text.split('\n').at(-1)).toBe('='.repeat(52));
  });

  it('uses singular form for 1 diff / skip / removed', () => {
    const result = makeResult({
      unchangedCount: 1,
      diffs: [makeDiff('d-1', 'note-only')],
      removedIds: ['r-1'],
      parseSkipped: [{ row: 3, reason: 'invalid status' }],
    });
    const out = summarizeRoundtripResultText(result);
    expect(out.text).toContain('1 unchanged, 1 diff, 0 added, 1 removed, 1 parser skip');
  });
});

describe('summarizeRoundtripResultText — risk tiers', () => {
  it('emits each tier in priority order with counts and samples', () => {
    const result = makeResult({
      diffs: [
        makeDiff('d-note', 'note-only'),
        makeDiff('d-status', 'status-edit'),
        makeDiff('d-struct', 'structural'),
        makeDiff('d-mixed', 'mixed'),
      ],
    });
    const out = summarizeRoundtripResultText(result);
    const idxStructural = out.text.indexOf('STRUCTURAL (1):');
    const idxMixed = out.text.indexOf('MIXED (1):');
    const idxStatus = out.text.indexOf('STATUS EDIT (1):');
    const idxNote = out.text.indexOf('NOTE ONLY (1):');
    expect(idxStructural).toBeGreaterThan(0);
    expect(idxMixed).toBeGreaterThan(idxStructural);
    expect(idxStatus).toBeGreaterThan(idxMixed);
    expect(idxNote).toBeGreaterThan(idxStatus);
    expect(out.text).toContain('  - d-struct');
    expect(out.text).toContain('  - d-mixed');
    expect(out.text).toContain('  - d-status');
    expect(out.text).toContain('  - d-note');
  });

  it('caps samples per tier and reports the overflow', () => {
    const diffs: DoseRoundtripDiff[] = [];
    for (let i = 0; i < 12; i++) {
      diffs.push(makeDiff(`d-note-${String(i).padStart(2, '0')}`, 'note-only'));
    }
    const result = makeResult({ diffs });
    const out = summarizeRoundtripResultText(result, { samplesPerTier: 5 });
    expect(out.text).toContain('NOTE ONLY (12):');
    expect(out.text).toContain('  ...and 7 more');
    expect(out.tierSamples['note-only']).toHaveLength(5);
  });

  it('omits empty tier blocks entirely', () => {
    const result = makeResult({
      diffs: [makeDiff('d-1', 'status-edit')],
    });
    const out = summarizeRoundtripResultText(result);
    expect(out.text).not.toContain('STRUCTURAL');
    expect(out.text).not.toContain('MIXED');
    expect(out.text).not.toContain('NOTE ONLY');
    expect(out.text).toContain('STATUS EDIT (1):');
  });

  it('packs 2 ids per line when there are 4+ samples', () => {
    const diffs: DoseRoundtripDiff[] = [];
    for (let i = 0; i < 4; i++) {
      diffs.push(makeDiff(`d-${i}`, 'note-only'));
    }
    const result = makeResult({ diffs });
    const out = summarizeRoundtripResultText(result, { samplesPerTier: 4 });
    expect(out.text).toContain('  - d-0, d-1');
    expect(out.text).toContain('  - d-2, d-3');
  });
});

describe('summarizeRoundtripResultText — adjacent lists', () => {
  it('emits added and removed lists with caps', () => {
    const result = makeResult({
      addedIds: ['a-1', 'a-2'],
      removedIds: ['r-1', 'r-2', 'r-3'],
    });
    const out = summarizeRoundtripResultText(result, { samplesPerAdjacent: 2 });
    expect(out.text).toContain('Added (2):');
    expect(out.text).toContain('  - a-1');
    expect(out.text).toContain('  - a-2');
    expect(out.text).toContain('Removed (3):');
    expect(out.text).toContain('  ...and 1 more');
  });

  it('skips adjacent block delimiter when nothing to emit', () => {
    const result = makeResult({
      diffs: [makeDiff('d-1', 'note-only')],
    });
    const out = summarizeRoundtripResultText(result);
    // Single light delimiter for the section under the stat line. We do
    // NOT want an empty adjacent-block delimiter to appear.
    const delimCount = out.text.split('\n').filter((l) => l === '-'.repeat(52)).length;
    expect(delimCount).toBe(2); // before stat line + before tier block
  });
});

describe('summarizeRoundtripResultText — parser skips', () => {
  it('groups skips by reason and shows row samples', () => {
    const result = makeResult({
      parseSkipped: [
        { row: 5, reason: 'invalid status' },
        { row: 12, reason: 'invalid status' },
        { row: 18, reason: 'invalid status' },
        { row: 20, reason: 'invalid status' },
        { row: 7, reason: 'malformed dueAt' },
      ],
    });
    const out = summarizeRoundtripResultText(result);
    expect(out.text).toContain('Parser skipped (5):');
    expect(out.text).toContain('  - invalid status [4x; rows 5, 12, 18, +1 more]');
    expect(out.text).toContain('  - malformed dueAt [1x; rows 7]');
  });

  it('caps reason count when there are many distinct reasons', () => {
    const result = makeResult({
      parseSkipped: [
        { row: 1, reason: 'reason-a' },
        { row: 2, reason: 'reason-b' },
        { row: 3, reason: 'reason-c' },
        { row: 4, reason: 'reason-d' },
        { row: 5, reason: 'reason-e' },
        { row: 6, reason: 'reason-f' },
      ],
    });
    const out = summarizeRoundtripResultText(result, { samplesPerSkipReason: 3 });
    expect(out.text).toContain('  ...and 3 more reasons');
  });
});

describe('summarizeRoundtripResultText — options', () => {
  it('omits the delimiter when includeDelimiter=false', () => {
    const result = makeResult({ unchangedCount: 1 });
    const out = summarizeRoundtripResultText(result, { includeDelimiter: false });
    expect(out.text.split('\n')[0]).not.toBe('='.repeat(52));
  });

  it('omits title when title=""', () => {
    const result = makeResult({ unchangedCount: 1 });
    const out = summarizeRoundtripResultText(result, { title: '' });
    expect(out.text).not.toContain('DOSE ROUND-TRIP REVIEW');
  });

  it('uses a custom title when provided', () => {
    const result = makeResult({ unchangedCount: 1 });
    const out = summarizeRoundtripResultText(result, { title: 'Patient 42 Daily Audit' });
    expect(out.text).toContain('Patient 42 Daily Audit');
  });

  it('returns deterministic output for the same input', () => {
    const result = makeResult({
      diffs: [
        makeDiff('d-1', 'note-only'),
        makeDiff('d-2', 'status-edit'),
      ],
      addedIds: ['a-1'],
      removedIds: ['r-1'],
    });
    const a = summarizeRoundtripResultText(result);
    const b = summarizeRoundtripResultText(result);
    expect(a.text).toBe(b.text);
  });

  it('reports the line count for caller consumption', () => {
    const result = makeResult({ unchangedCount: 5 });
    const out = summarizeRoundtripResultText(result);
    expect(out.lineCount).toBe(out.text.split('\n').length);
  });
});

describe('summarizeRoundtripTierSamplesText', () => {
  it('renders only tier blocks (no header, no delimiter)', () => {
    const result = makeResult({
      diffs: [makeDiff('d-1', 'structural'), makeDiff('d-2', 'note-only')],
    });
    const out = summarizeRoundtripTierSamplesText(result);
    expect(out).not.toContain('===');
    expect(out).not.toContain('DOSE ROUND-TRIP');
    expect(out).toContain('STRUCTURAL (1):');
    expect(out).toContain('NOTE ONLY (1):');
  });

  it('returns empty string for zero diffs', () => {
    const result = makeResult({ unchangedCount: 10 });
    expect(summarizeRoundtripTierSamplesText(result)).toBe('');
  });
});
