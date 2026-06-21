import { describe, it, expect } from 'vitest';
import {
  buildRegimenSnapshot,
  verifyRegimenSnapshot,
  diffRegimenSnapshots,
  type BuildSnapshotInput,
  type RegimenSnapshotInputItem,
  type SignedRegimenSnapshot,
  type SnapshotPayload,
} from '../src/regimen-snapshot-archive';
import type { Medication, Schedule } from '@med/types';

const SECRET = 'a-very-long-secret-of-at-least-32-bytes';
const SHORT_SECRET = 'too-short';

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

describe('buildRegimenSnapshot', () => {
  it('rejects secrets shorter than 32 chars', async () => {
    await expect(buildRegimenSnapshot(baseInput({ secret: SHORT_SECRET }))).rejects.toThrow();
  });

  it('produces an envelope with v=1 and the expected fields', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    expect(env.v).toBe(1);
    expect(env.snapshotId).toBe('11111111-1111-1111-1111-111111111111');
    expect(env.takenAt).toBe('2026-06-21T07:00:00.000Z');
    expect(env.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(env.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(env.payload.itemCount).toBe(2);
    expect(env.payload.items).toHaveLength(2);
  });

  it('canonicalises item order by medicationId regardless of input order', async () => {
    const reversed = baseInput({
      items: [...items()].reverse(),
    });
    const env = await buildRegimenSnapshot(reversed);
    expect(env.payload.items.map((i) => i.medicationId)).toEqual(['m-lisin', 'm-metf']);
  });

  it('canonicalises schedule times sort order', async () => {
    const input = baseInput({
      items: [
        {
          medication: med({ id: 'm-x', name: 'X' }),
          schedules: [sched({ id: 's-x', medicationId: 'm-x', times: ['20:00', '08:00', '14:00'] })],
        },
      ],
    });
    const env = await buildRegimenSnapshot(input);
    expect(env.payload.items[0]?.schedules[0]?.times).toEqual(['08:00', '14:00', '20:00']);
  });

  it('produces an identical envelope twice for the same input + takenAt', async () => {
    const a = await buildRegimenSnapshot(baseInput());
    const b = await buildRegimenSnapshot(baseInput());
    expect(a.payloadHash).toBe(b.payloadHash);
    expect(a.signature).toBe(b.signature);
  });

  it('captures meta block on the payload', async () => {
    const env = await buildRegimenSnapshot(baseInput({ meta: { clinic: 'County Health', reason: 'records request' } }));
    expect(env.payload.meta).toEqual({ clinic: 'County Health', reason: 'records request' });
  });

  it('captures inactive medications with active=false', async () => {
    const input = baseInput({
      items: [
        {
          medication: med({ id: 'm-old', name: 'Old', active: false, endDate: '2026-05-01' }),
          schedules: [],
        },
      ],
    });
    const env = await buildRegimenSnapshot(input);
    expect(env.payload.items[0]?.active).toBe(false);
    expect(env.payload.items[0]?.endDate).toBe('2026-05-01');
  });

  it('uses now() when takenAt is omitted', async () => {
    const env = await buildRegimenSnapshot({ ...baseInput(), takenAt: undefined });
    const t = Date.parse(env.takenAt);
    // Should be within 5 seconds of now.
    expect(Math.abs(Date.now() - t)).toBeLessThan(5_000);
  });
});

describe('verifyRegimenSnapshot', () => {
  it('returns ok=true for a freshly signed snapshot', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await verifyRegimenSnapshot(env, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshotId).toBe(env.snapshotId);
      expect(r.payload.itemCount).toBe(2);
    }
  });

  it('returns secret-too-short for short secrets', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await verifyRegimenSnapshot(env, SHORT_SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('secret-too-short');
  });

  it('returns malformed for non-object envelopes', async () => {
    const r = await verifyRegimenSnapshot('not-an-object', SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('returns malformed when required fields are missing', async () => {
    const r = await verifyRegimenSnapshot({ v: 1 }, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  it('returns bad-version for v != 1', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const tampered = { ...env, v: 2 } as SignedRegimenSnapshot;
    const r = await verifyRegimenSnapshot(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad-version');
  });

  it('returns payload-tampered when the payload is edited without recomputing the hash', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const tampered = {
      ...env,
      payload: { ...env.payload, patientName: 'Different Patient' },
    } as SignedRegimenSnapshot;
    const r = await verifyRegimenSnapshot(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('payload-tampered');
  });

  it('returns signature-mismatch when payload + hash both change but signature is not recomputed', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    // Simulate an attacker who edits the payload + payloadHash but cannot resign.
    // We use a deterministic but wrong hash so the signature path is reached.
    const tamperedPayload: SnapshotPayload = { ...env.payload, patientName: 'Other Patient' };
    const wrongHash = 'a'.repeat(64);
    const tampered = { ...env, payload: tamperedPayload, payloadHash: wrongHash } as SignedRegimenSnapshot;
    const r = await verifyRegimenSnapshot(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['payload-tampered', 'signature-mismatch']).toContain(r.reason);
  });

  it('detects snapshotId tampering as payload-tampered', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const tampered = { ...env, snapshotId: 'evil-snapshot-id' } as SignedRegimenSnapshot;
    const r = await verifyRegimenSnapshot(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('payload-tampered');
  });

  it('detects takenAt tampering as payload-tampered', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const tampered = { ...env, takenAt: '2099-01-01T00:00:00.000Z' } as SignedRegimenSnapshot;
    const r = await verifyRegimenSnapshot(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('payload-tampered');
  });

  it('rejects an envelope signed with a different secret', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const r = await verifyRegimenSnapshot(env, 'a-different-but-also-long-32+-bytes-secret');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['signature-mismatch', 'payload-tampered']).toContain(r.reason);
  });

  it('round-trips through JSON.stringify + JSON.parse', async () => {
    const env = await buildRegimenSnapshot(baseInput());
    const json = JSON.stringify(env);
    const parsed = JSON.parse(json);
    const r = await verifyRegimenSnapshot(parsed, SECRET);
    expect(r.ok).toBe(true);
  });
});

describe('diffRegimenSnapshots', () => {
  it('detects added medications', async () => {
    const a = (await buildRegimenSnapshot(baseInput())).payload;
    const b = (await buildRegimenSnapshot(baseInput({
      items: [
        ...items(),
        {
          medication: med({ id: 'm-new', name: 'NewMed' }),
          schedules: [],
        },
      ],
    }))).payload;
    const d = diffRegimenSnapshots(a, b);
    expect(d.added.map((x) => x.medicationId)).toEqual(['m-new']);
    expect(d.removed).toEqual([]);
  });

  it('detects removed medications', async () => {
    const a = (await buildRegimenSnapshot(baseInput())).payload;
    const b = (await buildRegimenSnapshot(baseInput({
      items: items().filter((i) => i.medication.id !== 'm-metf'),
    }))).payload;
    const d = diffRegimenSnapshots(a, b);
    expect(d.removed.map((x) => x.medicationId)).toEqual(['m-metf']);
    expect(d.added).toEqual([]);
  });

  it('detects strength changes', async () => {
    const a = (await buildRegimenSnapshot(baseInput())).payload;
    const newItems = items().map((it) =>
      it.medication.id === 'm-lisin'
        ? { ...it, medication: { ...it.medication, strength: '20 mg' } }
        : it,
    );
    const b = (await buildRegimenSnapshot(baseInput({ items: newItems }))).payload;
    const d = diffRegimenSnapshots(a, b);
    expect(d.strengthChanged).toHaveLength(1);
    expect(d.strengthChanged[0]?.before).toBe('10 mg');
    expect(d.strengthChanged[0]?.after).toBe('20 mg');
  });

  it('counts unchanged medications', async () => {
    const a = (await buildRegimenSnapshot(baseInput())).payload;
    const b = (await buildRegimenSnapshot(baseInput())).payload;
    const d = diffRegimenSnapshots(a, b);
    expect(d.unchangedCount).toBe(2);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.strengthChanged).toEqual([]);
  });

  it('returns alphabetised lists', async () => {
    const a = (await buildRegimenSnapshot(baseInput({ items: [] }))).payload;
    const b = (await buildRegimenSnapshot(baseInput({
      items: [
        { medication: med({ id: 'm-z', name: 'Zoloft' }), schedules: [] },
        { medication: med({ id: 'm-a', name: 'Aspirin' }), schedules: [] },
        { medication: med({ id: 'm-m', name: 'Metoprolol' }), schedules: [] },
      ],
    }))).payload;
    const d = diffRegimenSnapshots(a, b);
    expect(d.added.map((x) => x.name)).toEqual(['Aspirin', 'Metoprolol', 'Zoloft']);
  });
});
