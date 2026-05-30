import { describe, it, expect } from 'vitest';
import { computeColdChainStatus, temperatureDerating, type ColdChainSpec } from '../src/cold-chain';

const insulinPenSpec: ColdChainSpec = {
  medicationId: 'med-lantus',
  medicationName: 'Lantus SoloStar',
  roomTempBudgetHours: 28 * 24, // 28 days
  maxAllowedC: 30,
  nominalAmbientC: 22,
};

const iso = (year: number, month: number, day: number, hour = 12) =>
  new Date(Date.UTC(year, month - 1, day, hour, 0, 0)).toISOString();

describe('temperatureDerating', () => {
  it('returns 1 at or below nominal', () => {
    expect(temperatureDerating(20, 22)).toBe(1);
    expect(temperatureDerating(22, 22)).toBe(1);
  });
  it('doubles every 5C above nominal', () => {
    expect(temperatureDerating(27, 22)).toBeCloseTo(2, 5);
    expect(temperatureDerating(32, 22)).toBeCloseTo(4, 5);
  });
});

describe('computeColdChainStatus', () => {
  it('reports ok at nominal ambient', () => {
    const r = computeColdChainStatus({
      spec: insulinPenSpec,
      firstUseAt: iso(2026, 6, 1),
      excursions: [],
      now: iso(2026, 6, 2),
    });
    expect(r.status).toBe('ok');
    expect(r.mustDiscardNow).toBe(false);
    expect(r.consumedHours).toBeCloseTo(24, 3);
    expect(r.remainingHours).toBeCloseTo(28 * 24 - 24, 3);
  });

  it('marks overheat and requires discard when temperature exceeds max', () => {
    const r = computeColdChainStatus({
      spec: insulinPenSpec,
      firstUseAt: iso(2026, 6, 1),
      excursions: [{ startedAt: iso(2026, 6, 1, 13), endedAt: iso(2026, 6, 1, 14), temperatureC: 35 }],
      now: iso(2026, 6, 1, 15),
    });
    expect(r.status).toBe('overheat');
    expect(r.mustDiscardNow).toBe(true);
    expect(r.perExcursion[0]!.excursionExceededMax).toBe(true);
  });

  it('charges excursion time at the derated rate', () => {
    // 4-hour excursion at 27C (=2x derating) inside the first day.
    const r = computeColdChainStatus({
      spec: insulinPenSpec,
      firstUseAt: iso(2026, 6, 1),
      excursions: [{ startedAt: iso(2026, 6, 1, 13), endedAt: iso(2026, 6, 1, 17), temperatureC: 27 }],
      now: iso(2026, 6, 2),
    });
    // 1h ambient (12-13) + 4h * 2 (13-17) + 19h ambient (17 -> next day 12) = 28h.
    expect(r.consumedHours).toBeCloseTo(28, 3);
    expect(r.status).toBe('ok');
  });

  it('flags budget-exhausted when remaining drops to zero', () => {
    const r = computeColdChainStatus({
      spec: { ...insulinPenSpec, roomTempBudgetHours: 10 },
      firstUseAt: iso(2026, 6, 1),
      excursions: [],
      now: iso(2026, 6, 2),
    });
    expect(r.status).toBe('budget-exhausted');
    expect(r.remainingHours).toBe(0);
    expect(r.mustDiscardNow).toBe(true);
  });

  it('caps discardBy at manufacturer expiry', () => {
    const r = computeColdChainStatus({
      spec: { ...insulinPenSpec, manufacturerExpiresAt: iso(2026, 6, 3) },
      firstUseAt: iso(2026, 6, 1),
      excursions: [],
      now: iso(2026, 6, 2),
    });
    expect(r.discardBy).toBe(iso(2026, 6, 3));
    expect(r.status).toBe('ok');
  });

  it('marks expired when manufacturer expiry has passed', () => {
    const r = computeColdChainStatus({
      spec: { ...insulinPenSpec, manufacturerExpiresAt: iso(2026, 6, 1, 6) },
      firstUseAt: iso(2026, 6, 1),
      excursions: [],
      now: iso(2026, 6, 2),
    });
    expect(r.status).toBe('expired');
    expect(r.mustDiscardNow).toBe(true);
  });

  it('rejects now before firstUseAt', () => {
    expect(() =>
      computeColdChainStatus({
        spec: insulinPenSpec,
        firstUseAt: iso(2026, 6, 2),
        excursions: [],
        now: iso(2026, 6, 1),
      })
    ).toThrow(/now must be at or after firstUseAt/);
  });

  it('clips an excursion that extends past now', () => {
    const r = computeColdChainStatus({
      spec: insulinPenSpec,
      firstUseAt: iso(2026, 6, 1),
      excursions: [{ startedAt: iso(2026, 6, 1, 11), endedAt: iso(2026, 6, 5), temperatureC: 27 }],
      now: iso(2026, 6, 1, 14),
    });
    // firstUseAt is 12:00 so excursion starts at 12, ends clipped to 14: 2h at 2x = 4h.
    expect(r.consumedHours).toBeCloseTo(4, 3);
  });

  it('orders excursions and handles overlap deterministically', () => {
    const r = computeColdChainStatus({
      spec: insulinPenSpec,
      firstUseAt: iso(2026, 6, 1),
      excursions: [
        { startedAt: iso(2026, 6, 1, 13), endedAt: iso(2026, 6, 1, 15), temperatureC: 27 }, // 2h * 2 = 4
        { startedAt: iso(2026, 6, 1, 14), endedAt: iso(2026, 6, 1, 16), temperatureC: 27 }, // overlaps; only 15-16 counts: 1h * 2 = 2
      ],
      now: iso(2026, 6, 1, 18),
    });
    // 1h ambient (12-13) + 4 (excursion1) + 2 (excursion2 non-overlap) + 2h ambient (16-18) = 9h
    expect(r.consumedHours).toBeCloseTo(9, 3);
  });
});
