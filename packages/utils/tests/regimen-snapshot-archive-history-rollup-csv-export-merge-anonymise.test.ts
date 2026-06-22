import { describe, it, expect } from 'vitest';
import {
  mergeRegimenHistoryRollupCsvExportsAnonymised,
  mergeRegimenHistoryRollupCsvExportsAnonymisedCsvOnly,
  hashPatientIdForAnonymisedMerge,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise';
import type { RegimenHistoryCsvMergeInput } from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge';
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
const SECRET_ALT = 'a-DIFFERENT-test-secret-that-is-also-at-least-32-chars';

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

function items(specs: { id: string; name: string; strength?: string }[]): RegimenSnapshotInputItem[] {
  return specs.map((s) => ({
    medication: med(s),
    schedules: [sched(`s-${s.id}`, s.id)],
  }));
}

async function buildRollup(
  patientId: string,
  patientName: string,
  medPrefix: string,
  ...snapshots: { takenAt: string; items: RegimenSnapshotInputItem[] }[]
): Promise<RegimenHistoryRollup> {
  const signed: SignedRegimenSnapshot[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i]!;
    signed.push(
      await buildRegimenSnapshot({
        snapshotId: `${medPrefix}-snap-${i}`,
        patientId,
        patientName,
        items: s.items,
        secret: SECRET,
        takenAt: new Date(s.takenAt),
      }),
    );
  }
  return rollupRegimenHistory(signed.map((s) => s.payload));
}

async function makeSlice(
  patientId: string,
  patientName: string,
  medPrefix='m',
): Promise<RegimenHistoryCsvMergeInput> {
  const rollup = await buildRollup(
    patientId,
    patientName,
    medPrefix,
    {
      takenAt: '2026-02-01T00:00:00.000Z',
      items: items([{ id: `${medPrefix}-1`, name: 'Atorvastatin', strength: '10 mg' }]),
    },
    {
      takenAt: '2026-03-01T00:00:00.000Z',
      items: items([{ id: `${medPrefix}-1`, name: 'Atorvastatin', strength: '20 mg' }]),
    },
  );
  return { patientId, patientName, rollup };
}

describe('mergeRegimenHistoryRollupCsvExportsAnonymised', () => {
  it('replaces patientId and patientName columns with pseudonyms', async () => {
    const s1 = await makeSlice('pat-1', 'Alice Real');
    const s2 = await makeSlice('pat-2', 'Bob Real');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1, s2], {
      hmacSecret: SECRET,
    });
    // Real names must not leak.
    expect(out.merge.eventsCsv).not.toContain('Alice Real');
    expect(out.merge.eventsCsv).not.toContain('Bob Real');
    expect(out.merge.eventsCsv).not.toContain('pat-1');
    expect(out.merge.eventsCsv).not.toContain('pat-2');
    // Pseudonyms should appear.
    expect(out.merge.eventsCsv).toMatch(/^patientId,patientName,/);
    expect(out.merge.eventsCsv).toMatch(/pid-[0-9a-f]+/);
    expect(out.merge.eventsCsv).toMatch(/Patient [AB]/);
  });

  it('mapping links original -> pseudonym for caller reference', async () => {
    const s1 = await makeSlice('pat-1', 'Alice Real');
    const s2 = await makeSlice('pat-2', 'Bob Real');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1, s2], {
      hmacSecret: SECRET,
    });
    expect(out.mappings).toHaveLength(2);
    expect(out.mappings[0]!.originalPatientId).toBe('pat-1');
    expect(out.mappings[0]!.originalPatientName).toBe('Alice Real');
    expect(out.mappings[0]!.anonymisedPatientId).toMatch(/^pid-[0-9a-f]+$/);
    expect(out.mappings[0]!.anonymisedPatientName).toMatch(/^Patient [A-Z]$/);
  });

  it('is deterministic across runs with the same secret', async () => {
    const s1a = await makeSlice('pat-1', 'Alice Real');
    const s2a = await makeSlice('pat-2', 'Bob Real');
    const out1 = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1a, s2a], {
      hmacSecret: SECRET,
    });
    const s1b = await makeSlice('pat-1', 'Alice Real');
    const s2b = await makeSlice('pat-2', 'Bob Real');
    const out2 = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1b, s2b], {
      hmacSecret: SECRET,
    });
    expect(out1.mappings[0]!.anonymisedPatientId).toBe(out2.mappings[0]!.anonymisedPatientId);
    expect(out1.mappings[1]!.anonymisedPatientId).toBe(out2.mappings[1]!.anonymisedPatientId);
    expect(out1.merge.eventsCsv).toBe(out2.merge.eventsCsv);
  });

  it('changes pseudonyms when the secret rotates', async () => {
    const s1 = await makeSlice('pat-1', 'Alice Real');
    const a = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], { hmacSecret: SECRET });
    const b = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], { hmacSecret: SECRET_ALT });
    expect(a.mappings[0]!.anonymisedPatientId).not.toBe(b.mappings[0]!.anonymisedPatientId);
  });

  it('sequential strategy: pseudonyms assigned by hashed-id sorted order', async () => {
    const s1 = await makeSlice('pat-z', 'Zara');
    const s2 = await makeSlice('pat-a', 'Anne');
    // Input order: z then a. Sequential names are assigned by SORTED hashed-id
    // so the assignment is stable across input-array shuffles.
    const out1 = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1, s2], {
      hmacSecret: SECRET,
    });
    const out2 = await mergeRegimenHistoryRollupCsvExportsAnonymised([s2, s1], {
      hmacSecret: SECRET,
    });
    // Same originalId must map to same anonymisedPatientName regardless of input order.
    const zMap1 = out1.mappings.find((m) => m.originalPatientId === 'pat-z')!;
    const zMap2 = out2.mappings.find((m) => m.originalPatientId === 'pat-z')!;
    expect(zMap1.anonymisedPatientName).toBe(zMap2.anonymisedPatientName);
    const aMap1 = out1.mappings.find((m) => m.originalPatientId === 'pat-a')!;
    const aMap2 = out2.mappings.find((m) => m.originalPatientId === 'pat-a')!;
    expect(aMap1.anonymisedPatientName).toBe(aMap2.anonymisedPatientName);
  });

  it('hashed strategy: name is "Patient <hex>"', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
      nameStrategy: 'hashed',
    });
    expect(out.mappings[0]!.anonymisedPatientName).toMatch(/^Patient [0-9a-f]+$/);
  });

  it('redacted strategy: every name is literal "REDACTED"', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const s2 = await makeSlice('pat-2', 'Bob');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1, s2], {
      hmacSecret: SECRET,
      nameStrategy: 'redacted',
    });
    expect(out.mappings.every((m) => m.anonymisedPatientName === 'REDACTED')).toBe(true);
    expect(out.merge.eventsCsv).toContain(',REDACTED,');
  });

  it('respects custom hashPrefix', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
      hashPrefix: 'anon-',
    });
    expect(out.mappings[0]!.anonymisedPatientId).toMatch(/^anon-[0-9a-f]+$/);
  });

  it('respects custom hashHexLength', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
      hashHexLength: 8,
    });
    // 'pid-' (4 chars) + 8 hex chars = 12 total.
    expect(out.mappings[0]!.anonymisedPatientId).toHaveLength(12);
  });

  it('clamps hashHexLength to [4, 64]', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const tooShort = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
      hashHexLength: 1,
    });
    expect(tooShort.mappings[0]!.anonymisedPatientId).toHaveLength(8); // 'pid-' + 4
    const tooLong = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
      hashHexLength: 9999,
    });
    expect(tooLong.mappings[0]!.anonymisedPatientId).toHaveLength(68); // 'pid-' + 64
  });

  it('rejects empty or too-short secrets', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    await expect(
      mergeRegimenHistoryRollupCsvExportsAnonymised([s1], { hmacSecret: '' }),
    ).rejects.toThrow(/non-empty/);
    await expect(
      mergeRegimenHistoryRollupCsvExportsAnonymised([s1], { hmacSecret: 'short' }),
    ).rejects.toThrow(/at least 32/);
  });

  it('empty slice list: header-only CSV, no mappings, no collision', async () => {
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([], { hmacSecret: SECRET });
    expect(out.mappings).toEqual([]);
    expect(out.collisionDetected).toBe(false);
    expect(out.merge.eventsCsv).toContain('patientId,patientName,');
    expect(out.merge.eventRowCount).toBe(0);
  });

  it('preserves merge body columns (medication / event data unchanged)', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
    });
    // Strength-change from 10mg to 20mg must still appear in the CSV.
    expect(out.merge.eventsCsv).toContain('10 mg');
    expect(out.merge.eventsCsv).toContain('20 mg');
    expect(out.merge.eventsCsv).toContain('Atorvastatin');
  });

  it('passes through includeBom option to the merger', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const withBom = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
      includeBom: true,
    });
    expect(withBom.merge.eventsCsv.charCodeAt(0)).toBe(0xfeff);
  });

  it('csv-only convenience returns just the merge result', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymisedCsvOnly([s1], {
      hmacSecret: SECRET,
    });
    expect(out.eventsCsv).toContain('patientId,patientName,');
    expect(out.eventsCsv).toContain('pid-');
    // Should NOT have mappings — that's the "csv only" promise.
    expect((out as { mappings?: unknown }).mappings).toBeUndefined();
  });

  it('hashPatientIdForAnonymisedMerge agrees with the merge pseudonym', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
    });
    const standalone = await hashPatientIdForAnonymisedMerge(SECRET, 'pat-1');
    expect(out.mappings[0]!.anonymisedPatientId).toBe(standalone);
  });

  it('hashPatientIdForAnonymisedMerge: same secret + id => same hash', async () => {
    const a = await hashPatientIdForAnonymisedMerge(SECRET, 'pat-7');
    const b = await hashPatientIdForAnonymisedMerge(SECRET, 'pat-7');
    expect(a).toBe(b);
  });

  it('hashPatientIdForAnonymisedMerge: different ids => different hashes', async () => {
    const a = await hashPatientIdForAnonymisedMerge(SECRET, 'pat-1');
    const b = await hashPatientIdForAnonymisedMerge(SECRET, 'pat-2');
    expect(a).not.toBe(b);
  });

  it('hashPatientIdForAnonymisedMerge: rejects short secret', async () => {
    await expect(hashPatientIdForAnonymisedMerge('short', 'pat-1')).rejects.toThrow(/at least 32/);
  });

  it('multi-patient merge: per-patient row counts preserved post-anonymisation', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const s2 = await makeSlice('pat-2', 'Bob');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1, s2], {
      hmacSecret: SECRET,
    });
    expect(Object.keys(out.merge.perPatientEventRowCounts)).toHaveLength(2);
    // Per-patient keys now use pseudonyms, not original ids.
    expect(Object.keys(out.merge.perPatientEventRowCounts).every((k) => k.startsWith('pid-'))).toBe(true);
    expect(out.merge.patientIds.every((p) => p.startsWith('pid-'))).toBe(true);
  });

  it('strength values like "20 mg" survive RFC4180-safe (no quoting needed)', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
    });
    // No quotes around "20 mg" since it has no special chars.
    expect(out.merge.eventsCsv).not.toContain('"20 mg"');
    expect(out.merge.eventsCsv).toContain('20 mg');
  });

  it('preserves merge column order: patientId,patientName,snapshotId,...', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1], {
      hmacSecret: SECRET,
    });
    const header = out.merge.eventsCsv.split('\n')[0]!;
    expect(header).toBe(
      'patientId,patientName,snapshotId,takenAt,medicationId,medicationName,kind,before,after',
    );
  });

  it('idempotent under duplicate input slices (last-wins on hashing path)', async () => {
    const s1 = await makeSlice('pat-1', 'Alice');
    // Pass the same patientId twice — the buildPseudonyms loop short-circuits
    // on duplicate ids, but the merge body still contains both copies.
    const out = await mergeRegimenHistoryRollupCsvExportsAnonymised([s1, s1], {
      hmacSecret: SECRET,
    });
    expect(out.mappings).toHaveLength(2);
    expect(out.mappings[0]!.anonymisedPatientId).toBe(out.mappings[1]!.anonymisedPatientId);
  });
});
