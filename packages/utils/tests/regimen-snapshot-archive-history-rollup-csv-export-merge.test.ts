import { describe, it, expect } from 'vitest';
import {
  mergeRegimenHistoryRollupCsvExports,
  mergeRegimenHistoryRollupCsvExportsFromRollups,
  mergeRegimenHistoryEventsCsvOnly,
  mergeRegimenHistoryTimelineCsvOnly,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge';
import {
  exportRegimenHistoryRollupCsv,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export';
import {
  rollupRegimenHistory,
  type RegimenHistoryRollup,
} from '../src/regimen-snapshot-archive-history-rollup';
import {
  buildRegimenSnapshot,
  type RegimenSnapshotInputItem,
  type SignedRegimenSnapshot,
} from '../src/regimen-snapshot-archive';
import type { Medication, Schedule } from '@med/types';

const SECRET = 'a-very-long-test-secret-that-meets-min-bytes-please';

function med(
  overrides: Partial<Medication> & { id: string; name: string; strength?: string },
): Medication {
  return {
    id: overrides.id,
    userId: '00000000-0000-0000-0000-000000000001',
    drugId: overrides.drugId ?? 'd-1',
    name: overrides.name,
    strength: overrides.strength ?? '5 mg',
    form: overrides.form ?? 'tablet',
    startDate: overrides.startDate ?? '2026-01-01',
    endDate: overrides.endDate ?? null,
    active: overrides.active ?? true,
    supplyRemaining: overrides.supplyRemaining ?? 30,
    dosesPerRefill: overrides.dosesPerRefill ?? 30,
  } as Medication;
}

function sched(id: string, medicationId: string): Schedule {
  return {
    id,
    medicationId,
    kind: 'daily',
    times: ['08:00'],
    daysOfWeek: [],
    startsAt: '2026-01-01T08:00:00.000Z',
    endsAt: null,
    enabled: true,
  } as Schedule;
}

function items(
  specs: { id: string; name: string; strength?: string }[],
): RegimenSnapshotInputItem[] {
  return specs.map((s) => ({
    medication: med(s),
    schedules: [sched(`s-${s.id}`, s.id)],
  }));
}

async function makeSnap(
  snapshotId: string,
  takenAt: string,
  specs: { id: string; name: string; strength?: string }[],
): Promise<SignedRegimenSnapshot> {
  return buildRegimenSnapshot({
    snapshotId,
    patientId: '22222222-2222-2222-2222-222222222222',
    patientName: 'Test Patient',
    items: items(specs),
    secret: SECRET,
    takenAt: new Date(takenAt),
  });
}

async function patientARollup(): Promise<RegimenHistoryRollup> {
  const s1 = await makeSnap('a-s1', '2026-01-01T00:00:00.000Z', [
    { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
  ]);
  const s2 = await makeSnap('a-s2', '2026-04-01T00:00:00.000Z', [
    { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    { id: 'm-metf', name: 'Metformin', strength: '500 mg' },
  ]);
  return rollupRegimenHistory([s1.payload, s2.payload]);
}

async function patientBRollup(): Promise<RegimenHistoryRollup> {
  const s1 = await makeSnap('b-s1', '2026-02-01T00:00:00.000Z', [
    { id: 'm-atorv', name: 'Atorvastatin', strength: '20 mg' },
  ]);
  return rollupRegimenHistory([s1.payload]);
}

describe('mergeRegimenHistoryRollupCsvExports — header + structure', () => {
  it('emits both merged headers even with empty input', () => {
    const r = mergeRegimenHistoryRollupCsvExports([]);
    expect(r.eventsCsv.startsWith(
      'patientId,patientName,snapshotId,takenAt,medicationId,medicationName,kind,before,after\n',
    )).toBe(true);
    expect(r.timelineCsv.startsWith(
      'patientId,patientName,snapshotId,takenAt,itemCount,delta\n',
    )).toBe(true);
    expect(r.eventRowCount).toBe(0);
    expect(r.timelineRowCount).toBe(0);
    expect(r.patientIds).toEqual([]);
  });

  it('prepends patientId + patientName columns to every body row', async () => {
    const ra = await patientARollup();
    const rb = await patientBRollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
      { patientId: 'pat-b', patientName: 'Bob', rollup: rb },
    ]);
    const lines = merged.eventsCsv.trim().split('\n');
    // Header + Alice rows + Bob rows
    expect(lines[0]).toBe(
      'patientId,patientName,snapshotId,takenAt,medicationId,medicationName,kind,before,after',
    );
    // Every body row begins with one of the two patient ids
    for (const line of lines.slice(1)) {
      expect(line.startsWith('pat-a,Alice,') || line.startsWith('pat-b,Bob,')).toBe(true);
    }
  });

  it('preserves the per-patient row order (input order, sibling 1 first)', async () => {
    const ra = await patientARollup();
    const rb = await patientBRollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
      { patientId: 'pat-b', patientName: 'Bob', rollup: rb },
    ]);
    const lines = merged.eventsCsv.trim().split('\n').slice(1);
    const firstBobIdx = lines.findIndex((l) => l.startsWith('pat-b,'));
    const lastAliceIdx = lines.map((l, i) => l.startsWith('pat-a,') ? i : -1).filter((i) => i >= 0).pop()!;
    expect(lastAliceIdx).toBeLessThan(firstBobIdx);
  });

  it('records per-patient row counts and patient id list in input order', async () => {
    const ra = await patientARollup();
    const rb = await patientBRollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
      { patientId: 'pat-b', patientName: 'Bob', rollup: rb },
    ]);
    expect(merged.patientIds).toEqual(['pat-a', 'pat-b']);
    expect(merged.perPatientEventRowCounts['pat-a']).toBeGreaterThan(0);
    expect(merged.perPatientEventRowCounts['pat-b']).toBeGreaterThan(0);
    expect(merged.perPatientTimelineRowCounts['pat-a']).toBe(2);
    expect(merged.perPatientTimelineRowCounts['pat-b']).toBe(1);
  });
});

describe('mergeRegimenHistoryRollupCsvExports — BOM + null cells', () => {
  it('prepends BOM only when includeBom=true', async () => {
    const ra = await patientARollup();
    const slices = [{ patientId: 'p', patientName: 'P', rollup: ra }];
    const noBom = mergeRegimenHistoryRollupCsvExportsFromRollups(slices);
    const withBom = mergeRegimenHistoryRollupCsvExportsFromRollups(slices, { includeBom: true });
    expect(noBom.eventsCsv.startsWith('\uFEFF')).toBe(false);
    expect(withBom.eventsCsv.startsWith('\uFEFF')).toBe(true);
    expect(withBom.timelineCsv.startsWith('\uFEFF')).toBe(true);
  });

  it('preserves empty cells (no literal "null") through the merge', async () => {
    const ra = await patientARollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
    ]);
    expect(merged.eventsCsv).not.toMatch(/,null,/);
  });

  it('strips per-patient BOM when the caller passed includeBom in per-patient options', async () => {
    const ra = await patientARollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups(
      [{ patientId: 'pat-a', patientName: 'Alice', rollup: ra }],
      { perPatientExportOptions: { includeBom: true } },
    );
    // BOM is the FIRST byte of the merged output (or absent), never
    // duplicated inside the body.
    expect(merged.eventsCsv.indexOf('\uFEFF')).toBeLessThanOrEqual(0);
  });
});

describe('mergeRegimenHistoryRollupCsvExports — RFC 4180 patient name escaping', () => {
  it('quotes patient names containing commas', async () => {
    const ra = await patientARollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Doe, Jane', rollup: ra },
    ]);
    const lines = merged.eventsCsv.trim().split('\n').slice(1);
    for (const line of lines) {
      expect(line.startsWith('pat-a,"Doe, Jane",')).toBe(true);
    }
  });

  it('doubles embedded quotes per RFC 4180', async () => {
    const ra = await patientARollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Brand "ACME"', rollup: ra },
    ]);
    const lines = merged.eventsCsv.trim().split('\n').slice(1);
    for (const line of lines) {
      expect(line.startsWith('pat-a,"Brand ""ACME""",')).toBe(true);
    }
  });

  it('does not quote a patient name without special chars', async () => {
    const ra = await patientARollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
    ]);
    const lines = merged.eventsCsv.trim().split('\n').slice(1);
    for (const line of lines) {
      expect(line.startsWith('pat-a,Alice,')).toBe(true);
    }
  });
});

describe('mergeRegimenHistoryRollupCsvExports — pre-built exports', () => {
  it('accepts pre-built RegimenHistoryCsvExportResult instead of a rollup', async () => {
    const ra = await patientARollup();
    const exp = exportRegimenHistoryRollupCsv(ra);
    const merged = mergeRegimenHistoryRollupCsvExports([
      { patientId: 'pat-a', patientName: 'Alice', export: exp },
    ]);
    expect(merged.eventRowCount).toBe(exp.eventRowCount);
    expect(merged.timelineRowCount).toBe(exp.timelineRowCount);
  });

  it('handles a pre-built export that arrived with a BOM (strips it before re-headering)', async () => {
    const ra = await patientARollup();
    const exp = exportRegimenHistoryRollupCsv(ra, { includeBom: true });
    const merged = mergeRegimenHistoryRollupCsvExports([
      { patientId: 'pat-a', patientName: 'Alice', export: exp },
    ]);
    // The merged output should NOT contain a stray BOM in the middle.
    const bomCount = (merged.eventsCsv.match(/\uFEFF/g) ?? []).length;
    expect(bomCount).toBe(0);
  });

  it('throws when a slice has neither export nor rollup', () => {
    expect(() =>
      mergeRegimenHistoryRollupCsvExports([
        { patientId: 'pat-empty', patientName: 'Empty' },
      ]),
    ).toThrow(/Empty|patient/);
  });
});

describe('mergeRegimenHistoryRollupCsvExports — empty patients', () => {
  it('an empty rollup contributes zero rows to the merged body', () => {
    const empty = rollupRegimenHistory([]);
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-empty', patientName: 'Empty', rollup: empty },
    ]);
    expect(merged.eventRowCount).toBe(0);
    expect(merged.timelineRowCount).toBe(0);
    expect(merged.perPatientEventRowCounts['pat-empty']).toBe(0);
    expect(merged.perPatientTimelineRowCounts['pat-empty']).toBe(0);
  });

  it('mixed: one empty patient + one populated', async () => {
    const empty = rollupRegimenHistory([]);
    const ra = await patientARollup();
    const merged = mergeRegimenHistoryRollupCsvExportsFromRollups([
      { patientId: 'pat-empty', patientName: 'Empty', rollup: empty },
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
    ]);
    expect(merged.eventRowCount).toBeGreaterThan(0);
    expect(merged.perPatientEventRowCounts['pat-empty']).toBe(0);
    expect(merged.perPatientEventRowCounts['pat-a']).toBeGreaterThan(0);
  });
});

describe('mergeRegimenHistoryRollupCsvExports — convenience helpers', () => {
  it('mergeRegimenHistoryEventsCsvOnly returns events body alone', async () => {
    const ra = await patientARollup();
    const slices = [{ patientId: 'pat-a', patientName: 'Alice', rollup: ra }];
    const events = mergeRegimenHistoryEventsCsvOnly(slices);
    const full = mergeRegimenHistoryRollupCsvExportsFromRollups(slices);
    expect(events).toBe(full.eventsCsv);
  });

  it('mergeRegimenHistoryTimelineCsvOnly returns timeline body alone', async () => {
    const ra = await patientARollup();
    const slices = [{ patientId: 'pat-a', patientName: 'Alice', rollup: ra }];
    const timeline = mergeRegimenHistoryTimelineCsvOnly(slices);
    const full = mergeRegimenHistoryRollupCsvExportsFromRollups(slices);
    expect(timeline).toBe(full.timelineCsv);
  });
});

describe('mergeRegimenHistoryRollupCsvExports — determinism', () => {
  it('produces byte-identical output across two invocations', async () => {
    const ra = await patientARollup();
    const rb = await patientBRollup();
    const slices = [
      { patientId: 'pat-a', patientName: 'Alice', rollup: ra },
      { patientId: 'pat-b', patientName: 'Bob', rollup: rb },
    ];
    const a = mergeRegimenHistoryRollupCsvExportsFromRollups(slices);
    const b = mergeRegimenHistoryRollupCsvExportsFromRollups(slices);
    expect(a.eventsCsv).toBe(b.eventsCsv);
    expect(a.timelineCsv).toBe(b.timelineCsv);
  });
});
