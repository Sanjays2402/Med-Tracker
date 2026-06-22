import { describe, it, expect } from 'vitest';
import {
  exportRegimenHistoryRollupCsv,
  exportRegimenHistoryEventsCsv,
  exportRegimenHistoryTimelineCsv,
  exportRegimenHistoryEventsCsvForMedication,
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

async function makeTypicalRollup(): Promise<RegimenHistoryRollup> {
  const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
    { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
    { id: 'm-metf', name: 'Metformin', strength: '500 mg' },
  ]);
  const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
    { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    { id: 'm-metf', name: 'Metformin', strength: '500 mg' },
    { id: 'm-atorv', name: 'Atorvastatin', strength: '20 mg' },
  ]);
  const s3 = await makeSnap('s3', '2026-07-01T00:00:00.000Z', [
    { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    { id: 'm-atorv', name: 'Atorvastatin', strength: '40 mg' },
  ]);
  return rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
}

describe('exportRegimenHistoryRollupCsv — events CSV', () => {
  it('emits a header row even for an empty rollup', () => {
    const empty: RegimenHistoryRollup = rollupRegimenHistory([]);
    const result = exportRegimenHistoryRollupCsv(empty);
    expect(result.eventsCsv.startsWith('snapshotId,takenAt,medicationId,medicationName,kind,before,after\n')).toBe(true);
    expect(result.eventRowCount).toBe(0);
  });

  it('emits one row per event in medication-order by default', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup);
    const lines = result.eventsCsv.trim().split('\n');
    // header + amlo(added, strength-change) + atorv(added, strength-change) + metf(added, removed)
    expect(lines[0]).toBe('snapshotId,takenAt,medicationId,medicationName,kind,before,after');
    expect(lines.length).toBe(1 + 6);
    expect(result.eventRowCount).toBe(6);
  });

  it('orders events chronologically inside each medication', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup);
    const lines = result.eventsCsv.trim().split('\n').slice(1);
    // Find amlo rows. Amlo added at s1 then strength-change at s2.
    const amloRows = lines.filter((l) => l.includes('m-amlo'));
    expect(amloRows.length).toBe(2);
    expect(amloRows[0]!.startsWith('s1,')).toBe(true);
    expect(amloRows[1]!.startsWith('s2,')).toBe(true);
  });

  it('order=time produces a flat chronological list across medications', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup, { eventOrder: 'time' });
    const lines = result.eventsCsv.trim().split('\n').slice(1);
    // First-listed event should belong to s1 (1 jan), last should belong to s3 (1 jul).
    expect(lines[0]!.startsWith('s1,')).toBe(true);
    expect(lines[lines.length - 1]!.startsWith('s3,')).toBe(true);
  });

  it('encodes before / after as empty cells, not the literal "null"', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup);
    expect(result.eventsCsv).not.toMatch(/,null,/);
    // metformin removed event has no before / after — should be ",," empty
    const metfRemoved = result.eventsCsv
      .split('\n')
      .find((l) => l.includes('m-metf') && l.includes('removed'));
    expect(metfRemoved).toBeDefined();
    expect(metfRemoved!.endsWith(',,')).toBe(true);
  });

  it('RFC4180-escapes medication names containing commas', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Vitamin D, 1000 IU', strength: '1000 IU' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const result = exportRegimenHistoryRollupCsv(rollup);
    expect(result.eventsCsv).toContain('"Vitamin D, 1000 IU"');
  });

  it('escapes embedded double quotes by doubling them', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Brand "ACME"', strength: '5 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const result = exportRegimenHistoryRollupCsv(rollup);
    expect(result.eventsCsv).toContain('"Brand ""ACME"""');
  });
});

describe('exportRegimenHistoryRollupCsv — timeline CSV', () => {
  it('emits header even when empty', () => {
    const empty: RegimenHistoryRollup = rollupRegimenHistory([]);
    const result = exportRegimenHistoryRollupCsv(empty);
    expect(result.timelineCsv.startsWith('snapshotId,takenAt,itemCount,delta\n')).toBe(true);
    expect(result.timelineRowCount).toBe(0);
  });

  it('emits one row per snapshot with delta column', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup);
    const lines = result.timelineCsv.trim().split('\n');
    expect(lines.length).toBe(1 + 3);
    expect(lines[1]).toBe('s1,2026-01-01T00:00:00.000Z,2,0');
    expect(lines[2]).toBe('s2,2026-04-01T00:00:00.000Z,3,1');
    expect(lines[3]).toBe('s3,2026-07-01T00:00:00.000Z,2,-1');
    expect(result.timelineRowCount).toBe(3);
  });
});

describe('exportRegimenHistoryRollupCsv — BOM + convenience helpers', () => {
  it('prepends BOM when includeBom=true', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup, { includeBom: true });
    expect(result.eventsCsv.startsWith('\uFEFF')).toBe(true);
    expect(result.timelineCsv.startsWith('\uFEFF')).toBe(true);
  });

  it('omits BOM by default', async () => {
    const rollup = await makeTypicalRollup();
    const result = exportRegimenHistoryRollupCsv(rollup);
    expect(result.eventsCsv.startsWith('\uFEFF')).toBe(false);
    expect(result.timelineCsv.startsWith('\uFEFF')).toBe(false);
  });

  it('exportRegimenHistoryEventsCsv returns the events body alone', async () => {
    const rollup = await makeTypicalRollup();
    const events = exportRegimenHistoryEventsCsv(rollup);
    const fullResult = exportRegimenHistoryRollupCsv(rollup);
    expect(events).toBe(fullResult.eventsCsv);
  });

  it('exportRegimenHistoryTimelineCsv returns the timeline body alone', async () => {
    const rollup = await makeTypicalRollup();
    const tl = exportRegimenHistoryTimelineCsv(rollup);
    const fullResult = exportRegimenHistoryRollupCsv(rollup);
    expect(tl).toBe(fullResult.timelineCsv);
  });
});

describe('exportRegimenHistoryEventsCsvForMedication', () => {
  it('filters to a single medication', async () => {
    const rollup = await makeTypicalRollup();
    const csv = exportRegimenHistoryEventsCsvForMedication(rollup, 'm-amlo');
    const lines = csv.trim().split('\n');
    // header + 2 amlo events
    expect(lines.length).toBe(1 + 2);
    expect(lines.slice(1).every((l) => l.includes('m-amlo'))).toBe(true);
  });

  it('returns header-only CSV for unknown medication', async () => {
    const rollup = await makeTypicalRollup();
    const csv = exportRegimenHistoryEventsCsvForMedication(rollup, 'm-nonexistent');
    expect(csv).toBe('snapshotId,takenAt,medicationId,medicationName,kind,before,after\n');
  });
});

describe('exportRegimenHistoryRollupCsv — deterministic across runs', () => {
  it('produces byte-identical output across two invocations', async () => {
    const rollup = await makeTypicalRollup();
    const a = exportRegimenHistoryRollupCsv(rollup);
    const b = exportRegimenHistoryRollupCsv(rollup);
    expect(a.eventsCsv).toBe(b.eventsCsv);
    expect(a.timelineCsv).toBe(b.timelineCsv);
  });

  it('handles a single-snapshot rollup (all added events, no removed)', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Med A', strength: '5 mg' },
      { id: 'm-2', name: 'Med B', strength: '10 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const result = exportRegimenHistoryRollupCsv(rollup);
    expect(result.eventRowCount).toBe(2);
    expect(result.timelineRowCount).toBe(1);
    const lines = result.eventsCsv.trim().split('\n');
    expect(lines.slice(1).every((l) => l.includes(',added,'))).toBe(true);
  });
});
