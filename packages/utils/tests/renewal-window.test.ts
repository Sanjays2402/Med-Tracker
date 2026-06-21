import { describe, it, expect } from 'vitest';
import { computeRenewalWindow, rankRenewalGaps } from '../src/renewal-window';

describe('computeRenewalWindow', () => {
  it('marks too-early when before payer threshold', () => {
    // Filled day 0, 30-day supply, payer wants 75% consumed = day 23.
    // Today is day 10 => too-early.
    const out = computeRenewalWindow({
      medicationId: 'm1',
      filledOn: '2026-06-01',
      daysSupply: 30,
      unitsRemaining: 20,
      unitsPerDay: 1,
      now: new Date('2026-06-11T12:00:00Z'),
    });
    expect(out.earliestEligibleDate).toBe('2026-06-24');
    expect(out.eligibility).toBe('too-early');
    expect(out.payerWouldCoverNow).toBe(false);
    expect(out.daysOfSupplyOnHand).toBe(20);
    expect(out.projectedStockoutDate).toBe('2026-07-01');
  });

  it('marks eligible once payer threshold reached', () => {
    const out = computeRenewalWindow({
      medicationId: 'm1',
      filledOn: '2026-06-01',
      daysSupply: 30,
      unitsRemaining: 7,
      unitsPerDay: 1,
      now: new Date('2026-06-24T08:00:00Z'),
    });
    expect(out.eligibility).toBe('eligible');
    expect(out.payerWouldCoverNow).toBe(true);
  });

  it('marks overdue when stock is exhausted', () => {
    const out = computeRenewalWindow({
      medicationId: 'm1',
      filledOn: '2026-05-01',
      daysSupply: 30,
      unitsRemaining: 0,
      unitsPerDay: 1,
      now: new Date('2026-06-05T08:00:00Z'),
    });
    expect(out.eligibility).toBe('overdue');
    expect(out.payerWouldCoverNow).toBe(true);
    expect(out.reason).toMatch(/Stockout already passed/);
  });

  it('reports a positive refill gap when supply runs out before payer pays', () => {
    // 7-day supply, 90% payer ratio = eligible day 7 (ceil), but only 3
    // units remain at 1/day => stockout day 3. Gap = 7 - 3 = 4 days.
    const out = computeRenewalWindow({
      medicationId: 'm2',
      filledOn: '2026-06-01',
      daysSupply: 7,
      unitsRemaining: 3,
      unitsPerDay: 1,
      payerConsumedRatio: 0.9,
      now: new Date('2026-06-01T08:00:00Z'),
    });
    expect(out.earliestEligibleDate).toBe('2026-06-08');
    expect(out.projectedStockoutDate).toBe('2026-06-04');
    expect(out.refillGapDays).toBe(4);
    expect(out.reason).toMatch(/early-fill override/);
  });

  it('clamps payerConsumedRatio outside 0..1', () => {
    const a = computeRenewalWindow({
      medicationId: 'm', filledOn: '2026-06-01', daysSupply: 10,
      unitsRemaining: 10, unitsPerDay: 1, payerConsumedRatio: 2,
      now: new Date('2026-06-10T00:00:00Z'),
    });
    // ratio clamped to 1 => earliest = filledOn + 10
    expect(a.earliestEligibleDate).toBe('2026-06-11');
    const b = computeRenewalWindow({
      medicationId: 'm', filledOn: '2026-06-01', daysSupply: 10,
      unitsRemaining: 10, unitsPerDay: 1, payerConsumedRatio: -1,
      now: new Date('2026-06-01T00:00:00Z'),
    });
    // ratio clamped to 0 => eligible immediately
    expect(b.eligibility).toBe('eligible');
  });

  it('treats unitsPerDay=0 (PRN) as no stockout', () => {
    const out = computeRenewalWindow({
      medicationId: 'm', filledOn: '2026-06-01', daysSupply: 30,
      unitsRemaining: 20, unitsPerDay: 0,
      now: new Date('2026-06-10T00:00:00Z'),
    });
    expect(out.daysOfSupplyOnHand).toBe(Number.POSITIVE_INFINITY);
    expect(out.projectedStockoutDate).toBe('');
    expect(out.refillGapDays).toBe(Number.NEGATIVE_INFINITY);
  });

  it('throws on invalid inputs', () => {
    expect(() => computeRenewalWindow({
      medicationId: 'm', filledOn: '2026-06-01', daysSupply: 0,
      unitsRemaining: 10, unitsPerDay: 1,
    })).toThrow(/daysSupply/);
    expect(() => computeRenewalWindow({
      medicationId: 'm', filledOn: 'not-a-date', daysSupply: 30,
      unitsRemaining: 10, unitsPerDay: 1,
    })).toThrow(/filledOn/);
    expect(() => computeRenewalWindow({
      medicationId: 'm', filledOn: '2026-06-01', daysSupply: 30,
      unitsRemaining: -1, unitsPerDay: 1,
    })).toThrow(/unitsRemaining/);
  });
});

describe('rankRenewalGaps', () => {
  it('ranks overdue before too-early-with-gap before eligible', () => {
    const ranked = rankRenewalGaps([
      // eligible, safe
      { medicationId: 'a', filledOn: '2026-05-01', daysSupply: 30, unitsRemaining: 5, unitsPerDay: 1, now: new Date('2026-06-01T00:00:00Z') },
      // overdue
      { medicationId: 'b', filledOn: '2026-04-01', daysSupply: 30, unitsRemaining: 0, unitsPerDay: 1, now: new Date('2026-06-01T00:00:00Z') },
      // too-early but with positive gap (90% ratio, short on stock)
      { medicationId: 'c', filledOn: '2026-06-01', daysSupply: 7, unitsRemaining: 2, unitsPerDay: 1, payerConsumedRatio: 0.9, now: new Date('2026-06-01T00:00:00Z') },
    ]);
    expect(ranked.map((r) => r.medicationId)).toEqual(['b', 'c', 'a']);
  });
});
