import { describe, it, expect } from 'vitest';
import { planRefillBatches, type RefillCandidate } from '../src/refill-batching';

const NOW = new Date('2026-05-15T12:00:00Z'); // Friday

function cand(over: Partial<RefillCandidate>): RefillCandidate {
  return {
    medicationId: over.medicationId ?? Math.random().toString(36).slice(2),
    medicationName: over.medicationName ?? 'Drug',
    pharmacyId: over.pharmacyId ?? 'cvs-1',
    pharmacyName: over.pharmacyName ?? 'CVS',
    earliestFillDate: over.earliestFillDate ?? '2026-05-16T00:00:00Z',
    runOutDate: over.runOutDate ?? '2026-05-25T00:00:00Z',
    copayCents: over.copayCents ?? 500,
    daysSupply: over.daysSupply ?? 30,
    fillPreference: over.fillPreference,
    insurancePlanId: over.insurancePlanId,
  };
}

describe('planRefillBatches', () => {
  it('returns empty plan when no candidates', () => {
    const p = planRefillBatches([], { now: NOW });
    expect(p.batches).toEqual([]);
    expect(p.totalTrips).toBe(0);
    expect(p.totalCopayCents).toBe(0);
    expect(p.summary).toMatch(/no refills/i);
  });

  it('merges two same-pharmacy meds into one trip', () => {
    const plan = planRefillBatches(
      [
        cand({ medicationId: 'a', medicationName: 'A', earliestFillDate: '2026-05-16T00:00:00Z' }),
        cand({ medicationId: 'b', medicationName: 'B', earliestFillDate: '2026-05-17T00:00:00Z' }),
      ],
      { now: NOW, preferredPickupDow: 5 },
    );
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]!.medications).toHaveLength(2);
    expect(plan.batches[0]!.totalCopayCents).toBe(1000);
    expect(plan.batches[0]!.pickupDate.slice(0, 10)).toBe('2026-05-22');
  });

  it('splits pickups by pharmacy', () => {
    const plan = planRefillBatches(
      [
        cand({ medicationId: 'a', pharmacyId: 'cvs', pharmacyName: 'CVS' }),
        cand({ medicationId: 'b', pharmacyId: 'wal', pharmacyName: 'Walgreens' }),
      ],
      { now: NOW },
    );
    expect(plan.batches).toHaveLength(2);
    expect(plan.totalTrips).toBe(2);
  });

  it('splits a batch when copay cap is exceeded', () => {
    const plan = planRefillBatches(
      [
        cand({ medicationId: 'a', copayCents: 4000, earliestFillDate: '2026-05-16T00:00:00Z' }),
        cand({ medicationId: 'b', copayCents: 4000, earliestFillDate: '2026-05-16T00:00:00Z' }),
      ],
      { now: NOW, maxCopayCentsPerBatch: 5000 },
    );
    expect(plan.batches).toHaveLength(2);
    for (const b of plan.batches) expect(b.totalCopayCents).toBeLessThanOrEqual(5000);
  });

  it('marks past run-out as unbatched with a reason', () => {
    const plan = planRefillBatches(
      [cand({ medicationId: 'old', runOutDate: '2026-04-01T00:00:00Z', earliestFillDate: '2026-03-15T00:00:00Z' })],
      { now: NOW },
    );
    expect(plan.batches).toHaveLength(0);
    expect(plan.unbatched).toHaveLength(1);
    expect(plan.unbatched[0]!.reason).toMatch(/run-out/i);
  });

  it('clamps pickup to the run-out date when preferred dow is past it', () => {
    const plan = planRefillBatches(
      [cand({ medicationId: 'tight', earliestFillDate: '2026-05-16T00:00:00Z', runOutDate: '2026-05-18T00:00:00Z' })],
      { now: NOW, preferredPickupDow: 5 },
    );
    expect(plan.batches).toHaveLength(1);
    const pickup = plan.batches[0]!.pickupDate.slice(0, 10);
    expect(pickup <= '2026-05-18').toBe(true);
    expect(pickup >= '2026-05-16').toBe(true);
  });

  it('keeps separate batches when pickup dates are outside slack window', () => {
    const plan = planRefillBatches(
      [
        cand({ medicationId: 'a', earliestFillDate: '2026-05-16T00:00:00Z' }),
        cand({ medicationId: 'b', earliestFillDate: '2026-06-10T00:00:00Z', runOutDate: '2026-07-01T00:00:00Z' }),
      ],
      { now: NOW, windowSlackDays: 2 },
    );
    expect(plan.batches).toHaveLength(2);
  });

  it('is deterministic and order-independent for inputs', () => {
    const a = [cand({ medicationId: '1' }), cand({ medicationId: '2' })];
    const b = [a[1]!, a[0]!];
    const pa = planRefillBatches(a, { now: NOW });
    const pb = planRefillBatches(b, { now: NOW });
    expect(pa.batches.map((x) => x.medications.map((m) => m.medicationId).sort())).toEqual(
      pb.batches.map((x) => x.medications.map((m) => m.medicationId).sort()),
    );
  });
});
