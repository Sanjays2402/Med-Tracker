import { describe, it, expect } from 'vitest';
import {
  pickCheapestPlanTier,
  type PlanTierOffering,
  type PatientPlanState,
} from '../src/insurance-tier-pick';

function offering(overrides: Partial<PlanTierOffering>): PlanTierOffering {
  return {
    offeringId: overrides.offeringId ?? 'o-1',
    name: overrides.name ?? 'Lisinopril 10mg',
    tier: overrides.tier ?? 'generic',
    copayCents: overrides.copayCents ?? 500,
    fullPriceCents: overrides.fullPriceCents ?? 2500,
    daysSupply: overrides.daysSupply ?? 30,
    priorAuthRequired: overrides.priorAuthRequired,
    stepTherapyRequired: overrides.stepTherapyRequired,
    mailOrder: overrides.mailOrder,
  };
}

const ZERO_DEDUCTIBLE: PatientPlanState = { deductibleRemainingCents: 0 };

describe('pickCheapestPlanTier', () => {
  it('picks the lowest 30-day cost across tiers', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', tier: 'generic', copayCents: 500 }),
      offering({ offeringId: 'o-2', tier: 'preferred-brand', copayCents: 1500 }),
      offering({ offeringId: 'o-3', tier: 'non-preferred', copayCents: 4000 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.offeringId).toBe('o-1');
    expect(r.ranked).toHaveLength(3);
    expect(r.ranked[0]!.thirtyDayCostCents).toBe(500);
  });

  it('returns null pick when no offerings supplied', () => {
    const r = pickCheapestPlanTier([], ZERO_DEDUCTIBLE);
    expect(r.pick).toBeNull();
    expect(r.ranked).toEqual([]);
  });

  it('normalizes 90-day daysSupply to a per-30-day cost', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-30', daysSupply: 30, copayCents: 1500 }),
      offering({ offeringId: 'o-90', daysSupply: 90, copayCents: 3000 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    // 90-day pack: 3000 / 90 * 30 = 1000 vs 30-day: 1500
    expect(r.pick?.offeringId).toBe('o-90');
    expect(r.pick?.thirtyDayCostCents).toBe(1000);
  });

  it('flags prior-auth offerings without excluding them by default', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'cheap', copayCents: 500, priorAuthRequired: true }),
      offering({ offeringId: 'expensive', copayCents: 1500 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.offeringId).toBe('cheap');
    expect(r.pick?.flags).toContain('prior-auth-required');
  });

  it('excludes prior-auth offerings when allowPriorAuth is false', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'cheap', copayCents: 500, priorAuthRequired: true }),
      offering({ offeringId: 'expensive', copayCents: 1500 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE, { allowPriorAuth: false });
    expect(r.pick?.offeringId).toBe('expensive');
    expect(r.excluded).toHaveLength(1);
    expect(r.excluded[0]!.offeringId).toBe('cheap');
  });

  it('flags step-therapy offerings', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', copayCents: 500, stepTherapyRequired: true }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.flags).toContain('step-therapy-required');
  });

  it('breaks ties by preferring offerings without PA / step', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'pa', copayCents: 1000, priorAuthRequired: true }),
      offering({ offeringId: 'clean', copayCents: 1000 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.offeringId).toBe('clean');
  });

  it('uses full price while the patient has unmet deductible', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', copayCents: 500, fullPriceCents: 4500 }),
    ];
    const r = pickCheapestPlanTier(offerings, { deductibleRemainingCents: 50000 });
    // Full price applies (4500 <= 50000 remaining).
    expect(r.pick?.thirtyDayCostCents).toBe(4500);
    expect(r.pick?.flags).toContain('deductible-applies');
  });

  it('uses copay when the deductible would not cover this fill', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', copayCents: 500, fullPriceCents: 4500 }),
    ];
    const r = pickCheapestPlanTier(offerings, { deductibleRemainingCents: 100 });
    // fullPrice 4500 > remaining 100, fall back to copay.
    expect(r.pick?.thirtyDayCostCents).toBe(500);
    expect(r.pick?.flags).toContain('deductible-applies');
  });

  it('reports mail-order discount and 90-day pack flags', () => {
    const offerings: PlanTierOffering[] = [
      offering({
        offeringId: 'mail-90',
        daysSupply: 90,
        copayCents: 1500,
        mailOrder: true,
      }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.flags).toContain('mail-order-discount');
    expect(r.pick?.flags).toContain('ninety-day-pack');
  });

  it('skips mail-order-discount when preferMailOrderForLongTerm is false', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'mail-90', daysSupply: 90, mailOrder: true }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE, {
      preferMailOrderForLongTerm: false,
    });
    expect(r.pick?.flags).toContain('mail-order-discount');
    // 90-day-pack flag IS suppressed when preference is off, but mail-order-discount remains.
    expect(r.pick?.flags).not.toContain('ninety-day-pack');
  });

  it('weights dosesPerDay > 1 into the 30-day cost', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', daysSupply: 30, copayCents: 1500 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE, { dosesPerDay: 2 });
    // (1500 / 30) * 2 * 30 = 3000
    expect(r.pick?.thirtyDayCostCents).toBe(3000);
  });

  it('reports the 90-day projected cost', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', daysSupply: 30, copayCents: 1500 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    // 1500 * 3 = 4500
    expect(r.pick?.ninetyDayCostCents).toBe(4500);
  });

  it('excludes offerings with non-positive daysSupply', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'bad', daysSupply: 0 }),
      offering({ offeringId: 'good', daysSupply: 30, copayCents: 1500 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.offeringId).toBe('good');
    expect(r.excluded[0]!.offeringId).toBe('bad');
  });

  it('produces a reason string mentioning the tier and the dollar cost', () => {
    const offerings: PlanTierOffering[] = [
      offering({ offeringId: 'o-1', tier: 'generic', copayCents: 500 }),
    ];
    const r = pickCheapestPlanTier(offerings, ZERO_DEDUCTIBLE);
    expect(r.pick?.reason).toMatch(/generic/);
    expect(r.pick?.reason).toMatch(/\$5\.00/);
  });
});
