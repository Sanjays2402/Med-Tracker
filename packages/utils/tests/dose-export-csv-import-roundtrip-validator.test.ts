import { describe, it, expect } from 'vitest';
import {
  validateDoseCsvRoundtrip,
  filterDiffsByRisk,
  applyAcceptedDiffs,
  summarizeRoundtripResult,
} from '../src/dose-export-csv-import-roundtrip-validator';
import { buildDoseCsvExport } from '../src/dose-export-csv';
import type { Dose, Medication } from '@med/types';

const USER_ID = '22222222-2222-2222-2222-222222222222';
const MED_ID = '11111111-1111-1111-1111-111111111111';
const SCHED_ID = '44444444-4444-4444-4444-444444444444';

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: MED_ID,
    userId: USER_ID,
    drugId: 'metformin-500',
    name: 'Metformin',
    strength: '500 mg',
    form: 'tablet',
    startDate: '2026-01-01',
    active: true,
    supplyRemaining: 60,
    dosesPerRefill: 30,
    ...overrides,
  };
}

function dose(id: string, overrides: Partial<Dose> = {}): Dose {
  return {
    id,
    medicationId: MED_ID,
    scheduleId: SCHED_ID,
    dueAt: '2026-06-15T08:00:00.000Z',
    takenAt: '2026-06-15T08:05:00.000Z',
    status: 'taken',
    ...overrides,
  };
}

function exportToCsv(doses: Dose[]): string {
  return buildDoseCsvExport({
    userId: USER_ID,
    medications: [med()],
    doses,
  }).csv;
}

describe('validateDoseCsvRoundtrip — clean round-trip', () => {
  it('returns zero diffs for an unedited round-trip', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000001'),
      dose('00000000-0000-0000-0000-000000000002', { dueAt: '2026-06-16T08:00:00.000Z' }),
    ];
    const csv = exportToCsv(source);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toEqual([]);
    expect(result.unchangedCount).toBe(2);
    expect(result.addedIds).toEqual([]);
    expect(result.removedIds).toEqual([]);
    expect(result.parseSkipped).toEqual([]);
  });

  it('treats missing note vs empty note as identical', () => {
    const source = [dose('00000000-0000-0000-0000-000000000003')];
    const csv = exportToCsv(source);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toEqual([]);
    expect(result.unchangedCount).toBe(1);
  });

  it('preserves explicit notes through the round-trip', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000004', { note: 'morning dose' }),
    ];
    const csv = exportToCsv(source);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toEqual([]);
    expect(result.unchangedCount).toBe(1);
  });
});

describe('validateDoseCsvRoundtrip — note edits (low risk)', () => {
  it('flags a note-only edit as risk=note-only', () => {
    const source = [dose('00000000-0000-0000-0000-000000000005')];
    const csv = exportToCsv(source).replace(',\r\n', ',felt good\r\n');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('note-only');
    expect(result.diffs[0]!.changes).toHaveLength(1);
    expect(result.diffs[0]!.changes[0]!.field).toBe('note');
    expect(result.diffs[0]!.changes[0]!.after).toBe('felt good');
  });

  it('treats a note removed by re-import as note-only diff', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000006', { note: 'remove me' }),
    ];
    const csv = exportToCsv(source).replace('remove me', '');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('note-only');
    expect(result.diffs[0]!.changes[0]!.before).toBe('remove me');
    expect(result.diffs[0]!.changes[0]!.after).toBe(null);
  });
});

describe('validateDoseCsvRoundtrip — status edits (medium risk)', () => {
  it('flags a status flip as risk=status-edit', () => {
    const source = [dose('00000000-0000-0000-0000-000000000007')];
    const csv = exportToCsv(source).replace(',taken,', ',skipped,');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('status-edit');
    expect(result.diffs[0]!.changes[0]!.before).toBe('taken');
    expect(result.diffs[0]!.changes[0]!.after).toBe('skipped');
  });

  it('flags a takenAt edit as risk=status-edit', () => {
    const source = [dose('00000000-0000-0000-0000-000000000008')];
    const csv = exportToCsv(source).replace(
      '2026-06-15T08:05:00.000Z',
      '2026-06-15T09:30:00.000Z',
    );
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('status-edit');
    expect(result.diffs[0]!.changes[0]!.field).toBe('takenAt');
  });

  it('treats status + takenAt together as a single status-edit risk', () => {
    const source = [dose('00000000-0000-0000-0000-000000000009')];
    const csv = exportToCsv(source)
      .replace(',taken,', ',late,')
      .replace('08:05:00.000Z', '08:55:00.000Z');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('status-edit');
    expect(result.diffs[0]!.changes.map((c) => c.field).sort()).toEqual([
      'status',
      'takenAt',
    ]);
  });

  it('flags status + note together as mixed (status-edit + note)', () => {
    const source = [dose('00000000-0000-0000-0000-000000000010')];
    const csv = exportToCsv(source)
      .replace(',taken,', ',skipped,')
      .replace(',\r\n', ',felt nauseous\r\n');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    // status + note across different categories => mixed
    expect(result.diffs[0]!.risk).toBe('mixed');
  });
});

describe('validateDoseCsvRoundtrip — structural edits (high risk)', () => {
  it('flags a scheduleId change as risk=structural', () => {
    const source = [dose('00000000-0000-0000-0000-000000000011')];
    const csv = exportToCsv(source).replace(SCHED_ID, '55555555-5555-5555-5555-555555555555');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('structural');
    expect(result.diffs[0]!.changes[0]!.field).toBe('scheduleId');
  });

  it('flags a dueAt edit as structural', () => {
    const source = [dose('00000000-0000-0000-0000-000000000012')];
    const csv = exportToCsv(source).replace(
      '2026-06-15T08:00:00.000Z',
      '2026-06-15T07:00:00.000Z',
    );
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('structural');
    expect(result.diffs[0]!.changes[0]!.field).toBe('dueAt');
  });

  it('flags a medicationId change as structural', () => {
    const source = [dose('00000000-0000-0000-0000-000000000013')];
    const csv = exportToCsv(source).replace(
      MED_ID,
      '99999999-9999-9999-9999-999999999999',
    );
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('structural');
    expect(result.diffs[0]!.changes[0]!.field).toBe('medicationId');
  });

  it('flags structural + status combination as mixed', () => {
    const source = [dose('00000000-0000-0000-0000-000000000014')];
    const csv = exportToCsv(source)
      .replace(SCHED_ID, '55555555-5555-5555-5555-555555555555')
      .replace(',taken,', ',missed,');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0]!.risk).toBe('mixed');
  });
});

describe('validateDoseCsvRoundtrip — added / removed rows', () => {
  it('returns dose ids missing in the re-import in removedIds', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000015'),
      dose('00000000-0000-0000-0000-000000000016'),
    ];
    const csv = exportToCsv([source[0]!]);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.removedIds).toEqual(['00000000-0000-0000-0000-000000000016']);
    expect(result.unchangedCount).toBe(1);
    expect(result.diffs).toEqual([]);
  });

  it('returns dose ids new to the re-import in addedIds', () => {
    const source = [dose('00000000-0000-0000-0000-000000000017')];
    const extra = dose('00000000-0000-0000-0000-000000000018', {
      dueAt: '2026-06-16T08:00:00.000Z',
    });
    const csv = exportToCsv([source[0]!, extra]);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.addedIds).toEqual(['00000000-0000-0000-0000-000000000018']);
    expect(result.unchangedCount).toBe(1);
  });

  it('records parser skips for malformed status rows', () => {
    const source = [dose('00000000-0000-0000-0000-000000000019')];
    const csv = exportToCsv(source).replace(',taken,', ',nonsense,');
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.parseSkipped.length).toBeGreaterThan(0);
    expect(result.removedIds).toContain('00000000-0000-0000-0000-000000000019');
  });
});

describe('filterDiffsByRisk', () => {
  it('filters diffs by single risk tier', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000020'),
      dose('00000000-0000-0000-0000-000000000021', { dueAt: '2026-06-16T08:00:00.000Z' }),
    ];
    const csv = exportToCsv(source)
      .replace(',\r\n', ',n1\r\n') // first row note edit
      .replace(',\r\n', ',n2\r\n'); // second row note edit
    const result = validateDoseCsvRoundtrip(source, csv);
    const noteOnly = filterDiffsByRisk(result.diffs, 'note-only');
    expect(noteOnly).toHaveLength(2);
    const structural = filterDiffsByRisk(result.diffs, 'structural');
    expect(structural).toHaveLength(0);
  });

  it('filters by multiple risk tiers', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000022'),
      dose('00000000-0000-0000-0000-000000000023'),
    ];
    const csv = exportToCsv(source)
      .replace(',taken,', ',skipped,'); // first row only
    const result = validateDoseCsvRoundtrip(source, csv);
    const allowed = filterDiffsByRisk(result.diffs, ['note-only', 'status-edit']);
    expect(allowed).toHaveLength(1);
    expect(allowed[0]!.risk).toBe('status-edit');
  });
});

describe('applyAcceptedDiffs', () => {
  it('replaces only the accepted ids with their re-imported rows', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000024'),
      dose('00000000-0000-0000-0000-000000000025'),
    ];
    const csv = exportToCsv(source)
      .replace(',taken,', ',skipped,'); // first row only
    const result = validateDoseCsvRoundtrip(source, csv);
    const merged = applyAcceptedDiffs(source, result, [
      '00000000-0000-0000-0000-000000000024',
    ]);
    expect(merged[0]!.status).toBe('skipped');
    expect(merged[1]!.status).toBe('taken');
  });

  it('returns source unchanged when no ids accepted', () => {
    const source = [dose('00000000-0000-0000-0000-000000000026')];
    const csv = exportToCsv(source).replace(',taken,', ',skipped,');
    const result = validateDoseCsvRoundtrip(source, csv);
    const merged = applyAcceptedDiffs(source, result, []);
    expect(merged[0]!.status).toBe('taken');
  });

  it('does not add rows when the accepted id only exists in addedIds', () => {
    const source = [dose('00000000-0000-0000-0000-000000000027')];
    const extra = dose('00000000-0000-0000-0000-000000000028');
    const csv = exportToCsv([source[0]!, extra]);
    const result = validateDoseCsvRoundtrip(source, csv);
    const merged = applyAcceptedDiffs(source, result, [
      '00000000-0000-0000-0000-000000000028',
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('00000000-0000-0000-0000-000000000027');
  });

  it('does not mutate the source array', () => {
    const source = [dose('00000000-0000-0000-0000-000000000029')];
    const snapshot = JSON.parse(JSON.stringify(source));
    const csv = exportToCsv(source).replace(',taken,', ',skipped,');
    const result = validateDoseCsvRoundtrip(source, csv);
    applyAcceptedDiffs(source, result, [
      '00000000-0000-0000-0000-000000000029',
    ]);
    expect(source).toEqual(snapshot);
  });
});

describe('summarizeRoundtripResult', () => {
  it('summarises an empty roundtrip', () => {
    const source = [dose('00000000-0000-0000-0000-000000000030')];
    const csv = exportToCsv(source);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(summarizeRoundtripResult(result)).toBe(
      'Round-trip: 1 unchanged, 0 diffs, 0 added, 0 removed, 0 parser skips.',
    );
  });

  it('summarises a mixed roundtrip', () => {
    const source = [
      dose('00000000-0000-0000-0000-000000000031'),
      dose('00000000-0000-0000-0000-000000000032', { dueAt: '2026-06-16T08:00:00.000Z' }),
      dose('00000000-0000-0000-0000-000000000033', { dueAt: '2026-06-17T08:00:00.000Z' }),
    ];
    let csv = exportToCsv(source);
    // First row status-edit
    csv = csv.replace(',taken,', ',skipped,');
    const result = validateDoseCsvRoundtrip(source, csv);
    const summary = summarizeRoundtripResult(result);
    expect(summary).toContain('2 unchanged');
    expect(summary).toContain('1 diffs');
    expect(summary).toContain('status-edit');
  });

  it('reports parser skip counts in the summary', () => {
    const source = [dose('00000000-0000-0000-0000-000000000034')];
    const csv = exportToCsv(source).replace(',taken,', ',nonsense,');
    const result = validateDoseCsvRoundtrip(source, csv);
    const summary = summarizeRoundtripResult(result);
    expect(summary).toContain('1 parser skip.');
  });
});

describe('validateDoseCsvRoundtrip — stable ordering', () => {
  it('returns diffs sorted by dose id', () => {
    const ids = [
      '0000000a-0000-0000-0000-000000000035',
      '0000000c-0000-0000-0000-000000000037',
      '0000000b-0000-0000-0000-000000000036',
    ];
    const source = ids.map((id, i) =>
      dose(id, { dueAt: `2026-06-${15 + i}T08:00:00.000Z` }),
    );
    let csv = exportToCsv(source);
    // Edit all rows to force diffs.
    csv = csv.replace(/,taken,/g, ',skipped,');
    const result = validateDoseCsvRoundtrip(source, csv);
    const order = result.diffs.map((d) => d.doseId);
    expect(order).toEqual([
      '0000000a-0000-0000-0000-000000000035',
      '0000000b-0000-0000-0000-000000000036',
      '0000000c-0000-0000-0000-000000000037',
    ]);
  });

  it('returns added and removed ids sorted', () => {
    const source = [
      dose('00000000-0000-0000-0000-00000000003b'),
      dose('00000000-0000-0000-0000-00000000003a'),
    ];
    const reimport = [
      dose('00000000-0000-0000-0000-00000000003d'),
      dose('00000000-0000-0000-0000-00000000003c'),
    ];
    const csv = exportToCsv(reimport);
    const result = validateDoseCsvRoundtrip(source, csv);
    expect(result.removedIds).toEqual([
      '00000000-0000-0000-0000-00000000003a',
      '00000000-0000-0000-0000-00000000003b',
    ]);
    expect(result.addedIds).toEqual([
      '00000000-0000-0000-0000-00000000003c',
      '00000000-0000-0000-0000-00000000003d',
    ]);
  });
});
