import { describe, it, expect } from 'vitest';
import {
  restoreRegimenFromSnapshot,
  planRestoreFromPayload,
  summarizeRestorePlan,
  type CurrentRegimenItem,
} from '../src/regimen-snapshot-archive-restore';
import {
  buildRegimenSnapshot,
  type BuildSnapshotInput,
  type RegimenSnapshotInputItem,
  type SignedRegimenSnapshot,
} from '../src/regimen-snapshot-archive';
import type { Medication, Schedule } from '@med/types';

const SECRET = 'a-very-long-secret-of-at-least-32-bytes';
const OTHER_SECRET = 'a-DIFFERENT-secret-of-at-least-32-bytes';

function med(overrides: Partial<Medication> & { id: string; name: string }): Medication {
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
    ...(overrides.instructions !== undefined ? { instructions: overrides.instructions } : {}),
  } as Medication;
}

function sched(overrides: Partial<Schedule> & { id: string; medicationId: string }): Schedule {
  return {
    id: overrides.id,
    medicationId: overrides.medicationId,
    kind: overrides.kind ?? 'daily',
    times: overrides.times ?? ['08:00'],
    daysOfWeek: overrides.daysOfWeek ?? [],
    startsAt: overrides.startsAt ?? '2026-01-01T08:00:00.000Z',
    endsAt: overrides.endsAt ?? null,
    enabled: overrides.enabled ?? true,
    ...(overrides.intervalHours !== undefined ? { intervalHours: overrides.intervalHours } : {}),
    ...(overrides.cronExpression !== undefined ? { cronExpression: overrides.cronExpression } : {}),
  } as Schedule;
}

function items(): RegimenSnapshotInputItem[] {
  return [
    {
      medication: med({ id: 'm-lisin', name: 'Lisinopril', strength: '10 mg' }),
      schedules: [sched({ id: 's-lisin-1', medicationId: 'm-lisin', times: ['08:00'] })],
      prescriberId: 'p-1',
      pharmacyId: 'ph-1',
    },
    {
      medication: med({ id: 'm-metf', name: 'Metformin', strength: '500 mg' }),
      schedules: [sched({ id: 's-metf-1', medicationId: 'm-metf', times: ['08:00', '20:00'] })],
    },
  ];
}

function baseInput(overrides: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput {
  return {
    snapshotId: '11111111-1111-1111-1111-111111111111',
    patientId: '22222222-2222-2222-2222-222222222222',
    patientName: 'Test Patient',
    items: items(),
    secret: SECRET,
    takenAt: new Date('2026-06-21T07:00:00.000Z'),
    ...overrides,
  };
}

function currentFromItems(items: RegimenSnapshotInputItem[]): CurrentRegimenItem[] {
  return items.map((it) => ({
    medication: it.medication,
    schedules: it.schedules,
    ...(it.prescriberId !== undefined ? { prescriberId: it.prescriberId } : {}),
    ...(it.pharmacyId !== undefined ? { pharmacyId: it.pharmacyId } : {}),
  }));
}

describe('restoreRegimenFromSnapshot — verification', () => {
  it('returns ok=true for a valid envelope', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const result = await restoreRegimenFromSnapshot(env, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.snapshotId).toBe('11111111-1111-1111-1111-111111111111');
    }
  });

  it('returns signature-mismatch for the wrong secret', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const result = await restoreRegimenFromSnapshot(env, OTHER_SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('signature-mismatch');
  });

  it('returns malformed for a non-object envelope', async () => {
    const result = await restoreRegimenFromSnapshot('not-an-envelope', SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns malformed when keys are missing', async () => {
    const result = await restoreRegimenFromSnapshot({ v: 1 }, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('returns bad-version for an unsupported v', async () => {
    const env = (await buildRegimenSnapshot(baseInput())) as SignedRegimenSnapshot & {
      v: number;
    };
    env.v = 99 as 1;
    const result = await restoreRegimenFromSnapshot(env, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-version');
  });

  it('returns payload-tampered when payload edited but signature kept', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    env.payload.items[0]!.strength = '999 mg';
    const result = await restoreRegimenFromSnapshot(env, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('payload-tampered');
  });

  it('returns secret-too-short for short secrets', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const result = await restoreRegimenFromSnapshot(env, 'too-short');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('secret-too-short');
  });
});

describe('restoreRegimenFromSnapshot — plan (no current regimen)', () => {
  it('treats every snapshot row as add when no current regimen', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await restoreRegimenFromSnapshot(env, SECRET);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.counts.add).toBe(2);
    expect(r.plan.counts.unchanged).toBe(0);
    expect(r.plan.items.map((i) => i.action)).toEqual(['add', 'add']);
  });

  it('sorts items by name ascending', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await restoreRegimenFromSnapshot(env, SECRET);
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.items.map((i) => i.name)).toEqual(['Lisinopril', 'Metformin']);
  });

  it('hasChanges=true when there is at least one add', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await restoreRegimenFromSnapshot(env, SECRET);
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.hasChanges).toBe(true);
  });
});

describe('restoreRegimenFromSnapshot — diff actions', () => {
  it('marks identical entries as unchanged', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await restoreRegimenFromSnapshot(env, SECRET, {
      current: currentFromItems(items()),
    });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts.unchanged).toBe(2);
    expect(r.plan.hasChanges).toBe(false);
  });

  it('marks a strength delta as strength-change', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current[0]!.medication = { ...current[0]!.medication, strength: '20 mg' };
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts['strength-change']).toBe(1);
    const change = r.plan.items.find((i) => i.medicationId === 'm-lisin');
    expect(change?.action).toBe('strength-change');
  });

  it('marks an inactive -> active delta as reactivate', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current[0]!.medication = { ...current[0]!.medication, active: false };
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts.reactivate).toBe(1);
  });

  it('marks a schedule-times delta as schedule-change', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current[1]!.schedules = [sched({ id: 's-metf-1', medicationId: 'm-metf', times: ['09:00'] })];
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts['schedule-change']).toBe(1);
  });

  it('marks a prescriberId delta as prescriber-change', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current[0]!.prescriberId = 'p-DIFFERENT';
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts['prescriber-change']).toBe(1);
  });

  it('marks a pharmacyId delta as pharmacy-change', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current[0]!.pharmacyId = 'ph-DIFFERENT';
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts['pharmacy-change']).toBe(1);
  });

  it('marks multi-field divergence as collision and enumerates changes', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    // Diverge on BOTH strength + prescriber.
    current[0]!.medication = { ...current[0]!.medication, strength: '20 mg' };
    current[0]!.prescriberId = 'p-OTHER';
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts.collision).toBe(1);
    const collision = r.plan.items.find((i) => i.medicationId === 'm-lisin');
    expect(collision?.changes?.sort()).toEqual(['prescriber', 'strength']);
  });

  it('adds a missing snapshot medication as add', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items()).filter((c) => c.medication.id !== 'm-metf');
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.counts.add).toBe(1);
    const add = r.plan.items.find((i) => i.medicationId === 'm-metf');
    expect(add?.action).toBe('add');
    expect(add?.current).toBeUndefined();
  });
});

describe('restoreRegimenFromSnapshot — currentOnly', () => {
  it('surfaces medications in current but missing from snapshot', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current.push({
      medication: med({ id: 'm-new', name: 'Aspirin', strength: '81 mg' }),
      schedules: [],
    });
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.currentOnly).toHaveLength(1);
    expect(r.plan.currentOnly[0]?.medicationId).toBe('m-new');
    expect(r.plan.currentOnly[0]?.reason).toBe('added-after-snapshot');
  });

  it('does not flip hasChanges to true based on currentOnly alone', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current.push({
      medication: med({ id: 'm-new', name: 'Aspirin', strength: '81 mg' }),
      schedules: [],
    });
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    // All snapshot rows match exactly. The new "added-after" row
    // does not require a restore action.
    expect(r.plan.hasChanges).toBe(false);
  });

  it('sorts currentOnly by name', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current.push({
      medication: med({ id: 'm-z', name: 'Zinc', strength: '50 mg' }),
      schedules: [],
    });
    current.push({
      medication: med({ id: 'm-a', name: 'Aspirin', strength: '81 mg' }),
      schedules: [],
    });
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(r.plan.currentOnly.map((c) => c.name)).toEqual(['Aspirin', 'Zinc']);
  });
});

describe('planRestoreFromPayload', () => {
  it('builds the same plan as restoreRegimenFromSnapshot without re-verifying', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const restored = await restoreRegimenFromSnapshot(env, SECRET, {
      current: currentFromItems(items()),
    });
    if (!restored.ok) throw new Error('expected ok');
    const direct = planRestoreFromPayload(restored.payload, {
      current: currentFromItems(items()),
    });
    expect(direct).toEqual(restored.plan);
  });
});

describe('summarizeRestorePlan', () => {
  it('returns the "identical" line when there are zero changes', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await restoreRegimenFromSnapshot(env, SECRET, {
      current: currentFromItems(items()),
    });
    if (!r.ok) throw new Error('expected ok');
    expect(summarizeRestorePlan(r.plan)).toContain('identical');
  });

  it('lists action counts when there are changes', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current[0]!.medication = { ...current[0]!.medication, strength: '20 mg' };
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    const s = summarizeRestorePlan(r.plan);
    expect(s).toContain('1 strength-change');
    expect(s).toContain('Skip 1 unchanged');
  });

  it('mentions currentOnly when present', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const current = currentFromItems(items());
    current.push({
      medication: med({ id: 'm-new', name: 'Aspirin', strength: '81 mg' }),
      schedules: [],
    });
    const r = await restoreRegimenFromSnapshot(env, SECRET, { current });
    if (!r.ok) throw new Error('expected ok');
    expect(summarizeRestorePlan(r.plan)).toContain('1 medication in current regimen has no snapshot match');
  });
});
