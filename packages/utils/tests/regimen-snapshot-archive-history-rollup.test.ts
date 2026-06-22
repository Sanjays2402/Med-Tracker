import { describe, it, expect } from 'vitest';
import {
  rollupRegimenHistory,
  rollupSignedRegimenSnapshots,
  filterLongTermMedications,
  filterTitratedMedications,
} from '../src/regimen-snapshot-archive-history-rollup';
import {
  buildRegimenSnapshot,
  type RegimenSnapshotInputItem,
  type SignedRegimenSnapshot,
  type SnapshotPayload,
} from '../src/regimen-snapshot-archive';
import type { Medication, Schedule } from '@med/types';

const SECRET = 'a-very-long-secret-of-at-least-32-bytes';

function med(
  overrides: Partial<Medication> & { id: string; name: string; strength?: string },
): Medication {
  return {
    id: overrides.id,
    userId: '00000000-0000-0000-0000-000000000001',
    drugId: overrides.drugId ?? 'd-1',
    name: overrides.name,
    strength: overrides.strength ?? '10 mg',
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

describe('rollupRegimenHistory — empty / single snapshot', () => {
  it('returns an empty rollup for no snapshots', () => {
    const out = rollupRegimenHistory([]);
    expect(out.snapshotCount).toBe(0);
    expect(out.perMedication).toEqual([]);
    expect(out.timeline).toEqual([]);
    expect(out.eventCount).toBe(0);
    expect(out.cycledMedicationIds).toEqual([]);
  });

  it('returns added-events-only for a single seed snapshot', async () => {
    const s = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin' },
      { id: 'm-2', name: 'Lisinopril' },
    ]);
    const out = rollupRegimenHistory([s.payload]);
    expect(out.snapshotCount).toBe(1);
    expect(out.perMedication).toHaveLength(2);
    for (const m of out.perMedication) {
      expect(m.events).toHaveLength(1);
      expect(m.events[0]!.kind).toBe('added');
      expect(m.firstSeenSnapshotId).toBe('s-1');
      expect(m.lastSeenSnapshotId).toBe('s-1');
      expect(m.removed).toBe(false);
    }
    expect(out.timeline).toHaveLength(1);
    expect(out.timeline[0]!.delta).toBe(0);
  });
});

describe('rollupRegimenHistory — multi-snapshot diffs', () => {
  it('records a strength-change event when a med titrates', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Lisinopril', strength: '5 mg' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Lisinopril', strength: '10 mg' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    expect(out.perMedication[0]!.events).toHaveLength(2);
    const sc = out.perMedication[0]!.events[1]!;
    expect(sc.kind).toBe('strength-change');
    expect(sc.before).toBe('5 mg');
    expect(sc.after).toBe('10 mg');
    expect(sc.snapshotId).toBe('s-2');
  });

  it('records a removed event when a med disappears', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', []);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    const m = out.perMedication[0]!;
    expect(m.events.map((e) => e.kind)).toEqual(['added', 'removed']);
    expect(m.removed).toBe(true);
  });

  it('records an added event when a med appears in a later snapshot', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', []);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    expect(out.perMedication).toHaveLength(1);
    expect(out.perMedication[0]!.events).toHaveLength(1);
    expect(out.perMedication[0]!.events[0]!.kind).toBe('added');
    expect(out.perMedication[0]!.firstSeenSnapshotId).toBe('s-2');
  });

  it('flags a re-added medication as cycled', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', []);
    const s3 = await makeSnap('s-3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    expect(out.cycledMedicationIds).toEqual(['m-1']);
    const m = out.perMedication[0]!;
    expect(m.events.map((e) => e.kind)).toEqual(['added', 'removed', 'added']);
    expect(m.firstSeenSnapshotId).toBe('s-1');
    expect(m.lastSeenSnapshotId).toBe('s-3');
    expect(m.removed).toBe(false);
  });

  it('does not flag a never-removed medication as cycled', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin', strength: '20 mg' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    expect(out.cycledMedicationIds).toEqual([]);
  });
});

describe('rollupRegimenHistory — ordering', () => {
  it('sorts snapshots by takenAt before rollup', async () => {
    const s1 = await makeSnap('s-old', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin', strength: '81 mg' },
    ]);
    const s2 = await makeSnap('s-mid', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin', strength: '162 mg' },
    ]);
    const s3 = await makeSnap('s-new', '2026-07-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Aspirin', strength: '325 mg' },
    ]);
    // pass them out of order
    const out = rollupRegimenHistory([s3.payload, s1.payload, s2.payload]);
    expect(out.snapshotIds).toEqual(['s-old', 's-mid', 's-new']);
    const events = out.perMedication[0]!.events;
    expect(events.map((e) => e.kind)).toEqual([
      'added',
      'strength-change',
      'strength-change',
    ]);
    expect(events[1]!.after).toBe('162 mg');
    expect(events[2]!.after).toBe('325 mg');
  });

  it('returns perMedication sorted by name ascending', async () => {
    const s = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-2', name: 'Zoloft' },
      { id: 'm-1', name: 'Aspirin' },
      { id: 'm-3', name: 'Metformin' },
    ]);
    const out = rollupRegimenHistory([s.payload]);
    expect(out.perMedication.map((m) => m.name)).toEqual([
      'Aspirin',
      'Metformin',
      'Zoloft',
    ]);
  });
});

describe('rollupRegimenHistory — timeline', () => {
  it('reports per-snapshot item counts and deltas', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A' },
      { id: 'm-2', name: 'B' },
    ]);
    const s3 = await makeSnap('s-3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-2', name: 'B' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    expect(out.timeline.map((t) => t.itemCount)).toEqual([1, 2, 1]);
    expect(out.timeline.map((t) => t.delta)).toEqual([0, 1, -1]);
  });

  it('eventCount totals every event across medications', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A' },
      { id: 'm-2', name: 'B' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '20 mg' },
      // m-2 removed; m-3 added
      { id: 'm-3', name: 'C' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    // m-1: added + strength-change = 2 ; m-2: added + removed = 2 ; m-3: added = 1
    expect(out.eventCount).toBe(5);
  });
});

describe('rollupRegimenHistory — name evolution', () => {
  it('keeps the MOST RECENT name on the perMedication record', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Lisinopril (initial)' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Lisinopril (HCTZ added)' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    expect(out.perMedication[0]!.name).toBe('Lisinopril (HCTZ added)');
  });
});

describe('rollupSignedRegimenSnapshots', () => {
  it('rolls up signed envelopes by unwrapping payload', async () => {
    const envelopes = [
      await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [{ id: 'm-1', name: 'A' }]),
      await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [{ id: 'm-1', name: 'A' }]),
    ];
    const out = rollupSignedRegimenSnapshots(envelopes);
    expect(out.snapshotCount).toBe(2);
    expect(out.snapshotIds).toEqual(['s-1', 's-2']);
  });
});

describe('filterLongTermMedications', () => {
  it('returns meds present in the FIRST snapshot AND not removed', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'LongTerm' },
      { id: 'm-2', name: 'EarlyRemoved' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'LongTerm' },
      { id: 'm-3', name: 'LateAdded' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    const longTerm = filterLongTermMedications(out);
    expect(longTerm.map((m) => m.name)).toEqual(['LongTerm']);
  });

  it('returns empty on an empty rollup', () => {
    const out = rollupRegimenHistory([]);
    expect(filterLongTermMedications(out)).toEqual([]);
  });
});

describe('filterTitratedMedications', () => {
  it('returns meds with at least one strength-change event', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Stable' },
      { id: 'm-2', name: 'Titrated', strength: '5 mg' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Stable' },
      { id: 'm-2', name: 'Titrated', strength: '10 mg' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    const titrated = filterTitratedMedications(out);
    expect(titrated.map((m) => m.name)).toEqual(['Titrated']);
  });

  it('returns empty when no titrations across the window', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Stable' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'Stable' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    expect(filterTitratedMedications(out)).toEqual([]);
  });
});

describe('rollupRegimenHistory — pairwise agreement with diffRegimenSnapshots', () => {
  it('strength-change events align with diffRegimenSnapshots pairwise diffs', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '5 mg' },
      { id: 'm-2', name: 'B', strength: '10 mg' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '10 mg' },
      { id: 'm-2', name: 'B', strength: '10 mg' },
      { id: 'm-3', name: 'C' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload]);
    const m1 = out.perMedication.find((m) => m.medicationId === 'm-1')!;
    expect(m1.events.filter((e) => e.kind === 'strength-change')).toHaveLength(1);
    const m2 = out.perMedication.find((m) => m.medicationId === 'm-2')!;
    expect(m2.events.filter((e) => e.kind === 'strength-change')).toHaveLength(0);
    const m3 = out.perMedication.find((m) => m.medicationId === 'm-3')!;
    expect(m3.events.filter((e) => e.kind === 'added')).toHaveLength(1);
  });
});

describe('rollupRegimenHistory — extension', () => {
  it('handles a long sequence with titrations and removals correctly', async () => {
    const seq: SnapshotPayload[] = [];
    seq.push((await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '5 mg' },
    ])).payload);
    seq.push((await makeSnap('s-2', '2026-02-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '10 mg' },
      { id: 'm-2', name: 'B' },
    ])).payload);
    seq.push((await makeSnap('s-3', '2026-03-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '20 mg' },
      { id: 'm-2', name: 'B' },
    ])).payload);
    seq.push((await makeSnap('s-4', '2026-04-01T00:00:00.000Z', [
      { id: 'm-1', name: 'A', strength: '20 mg' },
    ])).payload);
    const out = rollupRegimenHistory(seq);
    const a = out.perMedication.find((m) => m.medicationId === 'm-1')!;
    expect(a.events.filter((e) => e.kind === 'strength-change')).toHaveLength(2);
    expect(a.removed).toBe(false);
    const b = out.perMedication.find((m) => m.medicationId === 'm-2')!;
    expect(b.events.filter((e) => e.kind === 'removed')).toHaveLength(1);
    expect(b.removed).toBe(true);
  });

  it('stable ordering: cycledMedicationIds sorted ascending', async () => {
    const s1 = await makeSnap('s-1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-b', name: 'B' },
      { id: 'm-a', name: 'A' },
    ]);
    const s2 = await makeSnap('s-2', '2026-04-01T00:00:00.000Z', []);
    const s3 = await makeSnap('s-3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-a', name: 'A' },
      { id: 'm-b', name: 'B' },
    ]);
    const out = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    expect(out.cycledMedicationIds).toEqual(['m-a', 'm-b']);
  });
});
