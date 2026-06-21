import { describe, it, expect } from 'vitest';
import {
  projectRefillCosts,
  summarizeRegimenCost,
  formatCentsUsd,
  type MedicationCostProfile,
  type PlanChange,
} from '../src/refill-cost-projector';

function med(overrides: Partial<MedicationCostProfile>): MedicationCostProfile {
  return {
    medicationId: overrides.medicationId ?? 'm-1',
    name: overrides.name ?? 'Lisinopril',
    copayCents: overrides.copayCents ?? 1000,
    daysSupply: overrides.daysSupply ?? 30,
    firstFillAt: overrides.firstFillAt,
    inactive: overrides.inactive,
  };
}

describe('formatCentsUsd', () => {
  it('formats whole dollars', () => {
    expect(formatCentsUsd(123_400)).toBe('$1,234.00');
  });
  it('formats fractional cents', () => {
    expect(formatCentsUsd(1234)).toBe('$12.34');
  });
  it('handles zero', () => {
    expect(formatCentsUsd(0)).toBe('$0.00');
  });
});

describe('projectRefillCosts', () => {
  const FROM = new Date(2026, 0, 1); // Jan 1 2026
  const ONE_YEAR_TO = new Date(2026, 11, 31); // Dec 31 2026

  it('projects monthly fills for a single 30-day medication', () => {
    const out = projectRefillCosts({
      medications: [med({ copayCents: 1000, daysSupply: 30, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.perMedication).toHaveLength(1);
    const proj = out.perMedication[0]!;
    // 365-day window with 30-day cadence starting Jan 1 -> Jan, Jan+30, Jan+60... up through Dec 31
    expect(proj.fillCount).toBeGreaterThanOrEqual(12);
    expect(proj.fillCount).toBeLessThanOrEqual(13);
    expect(proj.totalCents).toBe(proj.fillCount * 1000);
    expect(proj.fills[0]?.filledOn).toBe('2026-01-01');
    expect(proj.fills[0]?.copayCents).toBe(1000);
  });

  it('projects quarterly fills for a 90-day mail-order medication', () => {
    const out = projectRefillCosts({
      medications: [med({ daysSupply: 90, copayCents: 2500, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.perMedication[0]?.fillCount).toBe(5); // Jan 1, Apr 1, Jul 1, Sep 29, Dec 28 (within window)
    expect(out.totalCents).toBe(5 * 2500);
  });

  it('sums across the regimen', () => {
    const out = projectRefillCosts({
      medications: [
        med({ medicationId: 'm-1', copayCents: 1000, daysSupply: 30, firstFillAt: FROM }),
        med({ medicationId: 'm-2', name: 'Metformin', copayCents: 500, daysSupply: 30, firstFillAt: FROM }),
      ],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    const sum = out.perMedication.reduce((s, p) => s + p.totalCents, 0);
    expect(out.totalCents).toBe(sum);
    expect(out.perMedication).toHaveLength(2);
  });

  it('skips inactive medications and counts them', () => {
    const out = projectRefillCosts({
      medications: [
        med({ medicationId: 'm-1', copayCents: 1000 }),
        med({ medicationId: 'm-2', inactive: true }),
      ],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.perMedication).toHaveLength(1);
    expect(out.inactiveCount).toBe(1);
  });

  it('catches up cadence when firstFillAt is in the past', () => {
    // firstFillAt = Oct 1 2025, daysSupply 30 -> first projected fill on
    // or after Jan 1 2026 should be Jan 28 (Oct 1, Oct 31, Nov 30, Dec 30, Jan 29 actually)
    const past = new Date(2025, 9, 1); // Oct 1 2025
    const out = projectRefillCosts({
      medications: [med({ daysSupply: 30, copayCents: 1000, firstFillAt: past })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    const firstFill = out.perMedication[0]?.fills[0];
    expect(firstFill).toBeDefined();
    expect(Date.parse(firstFill!.filledOn)).toBeGreaterThanOrEqual(FROM.getTime());
    // Cadence should remain 30-day from the original anchor (no drift).
    expect(out.perMedication[0]?.cadenceDays).toBe(30);
  });

  it('uses firstFillAt directly when it sits inside the window', () => {
    const inside = new Date(2026, 2, 15);
    const out = projectRefillCosts({
      medications: [med({ daysSupply: 30, copayCents: 1000, firstFillAt: inside })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.perMedication[0]?.fills[0]?.filledOn).toBe('2026-03-15');
  });

  it('respects a plan change cut-over date', () => {
    const planChange: PlanChange = {
      effectiveAt: new Date(2026, 6, 1), // Jul 1
      copayOverridesCents: { 'm-1': 200 }, // drops from 1000 to 200
    };
    const out = projectRefillCosts({
      medications: [med({ medicationId: 'm-1', copayCents: 1000, daysSupply: 30, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
      planChange,
    });
    const cutoverMs = (planChange.effectiveAt as Date).getTime();
    const fillsBeforeJul1 = out.perMedication[0]!.fills.filter(
      (f) => Date.parse(f.filledOn) < cutoverMs,
    );
    const fillsOnOrAfterJul1 = out.perMedication[0]!.fills.filter(
      (f) => Date.parse(f.filledOn) >= cutoverMs,
    );
    expect(fillsBeforeJul1.every((f) => f.copayCents === 1000)).toBe(true);
    expect(fillsOnOrAfterJul1.every((f) => f.copayCents === 200)).toBe(true);
    expect(out.planChangeSavingsCents).toBeGreaterThan(0);
  });

  it('exposes pre- and post-change spend separately', () => {
    const planChange: PlanChange = {
      effectiveAt: new Date(2026, 6, 1),
      copayOverridesCents: { 'm-1': 200 },
    };
    const out = projectRefillCosts({
      medications: [med({ medicationId: 'm-1', copayCents: 1000, daysSupply: 30, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
      planChange,
    });
    const proj = out.perMedication[0]!;
    expect(proj.preChangeCents + proj.postChangeCents).toBe(proj.totalCents);
    expect(proj.preChangeCents).toBeGreaterThan(0);
    expect(proj.postChangeCents).toBeGreaterThan(0);
  });

  it('reports negative savings when the plan change costs more', () => {
    const planChange: PlanChange = {
      effectiveAt: new Date(2026, 6, 1),
      copayOverridesCents: { 'm-1': 5000 }, // jumps from 1000 to 5000
    };
    const out = projectRefillCosts({
      medications: [med({ medicationId: 'm-1', copayCents: 1000, daysSupply: 30, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
      planChange,
    });
    expect(out.planChangeSavingsCents).toBeLessThan(0);
  });

  it('skips overrides for medications not in the planChange map', () => {
    const planChange: PlanChange = {
      effectiveAt: new Date(2026, 6, 1),
      copayOverridesCents: { 'm-1': 200 },
    };
    const out = projectRefillCosts({
      medications: [
        med({ medicationId: 'm-1', copayCents: 1000 }),
        med({ medicationId: 'm-2', name: 'Metformin', copayCents: 800 }),
      ],
      from: FROM,
      to: ONE_YEAR_TO,
      planChange,
    });
    const m2 = out.perMedication.find((p) => p.medicationId === 'm-2')!;
    expect(m2.fills.every((f) => f.copayCents === 800)).toBe(true);
  });

  it('defaults window to today + 365 days when not specified', () => {
    const out = projectRefillCosts({
      medications: [med({ copayCents: 1000, daysSupply: 30 })],
    });
    const start = Date.parse(out.windowStart);
    const end = Date.parse(out.windowEnd);
    expect(end - start).toBeGreaterThanOrEqual(364 * 86_400_000);
    expect(end - start).toBeLessThanOrEqual(366 * 86_400_000);
  });

  it('throws when to is before from', () => {
    expect(() =>
      projectRefillCosts({
        medications: [med({})],
        from: new Date(2026, 5, 1),
        to: new Date(2026, 4, 1),
      }),
    ).toThrow(/`to` must be on or after/);
  });

  it('handles zero daysSupply by emitting no fills', () => {
    const out = projectRefillCosts({
      medications: [med({ daysSupply: 0, copayCents: 1000, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.perMedication[0]?.fillCount).toBe(0);
    expect(out.totalCents).toBe(0);
  });

  it('does not project anything before firstFillAt when it lies in the window', () => {
    const out = projectRefillCosts({
      medications: [med({ firstFillAt: new Date(2026, 5, 15), daysSupply: 30, copayCents: 1000 })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    const earliest = out.perMedication[0]!.fills[0]!.filledOn;
    expect(Date.parse(earliest)).toBeGreaterThanOrEqual(Date.parse('2026-06-15'));
  });

  it('totals match per-medication sum even with mixed cadences', () => {
    const out = projectRefillCosts({
      medications: [
        med({ medicationId: 'a', daysSupply: 30, copayCents: 1000, firstFillAt: FROM }),
        med({ medicationId: 'b', daysSupply: 90, copayCents: 2500, firstFillAt: FROM }),
        med({ medicationId: 'c', daysSupply: 14, copayCents: 750, firstFillAt: FROM }),
      ],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.totalCents).toBe(out.perMedication.reduce((s, p) => s + p.totalCents, 0));
  });

  it('totalCentsWithoutPlanChange equals totalCents when no plan change is set', () => {
    const out = projectRefillCosts({
      medications: [med({ copayCents: 1000, daysSupply: 30, firstFillAt: FROM })],
      from: FROM,
      to: ONE_YEAR_TO,
    });
    expect(out.totalCentsWithoutPlanChange).toBe(out.totalCents);
    expect(out.planChangeSavingsCents).toBe(0);
  });
});

describe('summarizeRegimenCost', () => {
  it('summarizes a single-med 12-month projection', () => {
    const out = projectRefillCosts({
      medications: [med({ copayCents: 1000, daysSupply: 30, firstFillAt: new Date(2026, 0, 1) })],
      from: new Date(2026, 0, 1),
      to: new Date(2026, 11, 31),
    });
    const s = summarizeRegimenCost(out);
    expect(s).toMatch(/Projected \$/);
    expect(s).toMatch(/1 medication/);
    expect(s).toMatch(/months/);
  });

  it('mentions plan change savings when positive', () => {
    const planChange: PlanChange = {
      effectiveAt: new Date(2026, 6, 1),
      copayOverridesCents: { 'm-1': 200 },
    };
    const out = projectRefillCosts({
      medications: [med({ medicationId: 'm-1', copayCents: 1000, daysSupply: 30, firstFillAt: new Date(2026, 0, 1) })],
      from: new Date(2026, 0, 1),
      to: new Date(2026, 11, 31),
      planChange,
    });
    const s = summarizeRegimenCost(out);
    expect(s).toMatch(/saves/);
  });

  it('mentions extra cost when plan change is worse', () => {
    const planChange: PlanChange = {
      effectiveAt: new Date(2026, 6, 1),
      copayOverridesCents: { 'm-1': 5000 },
    };
    const out = projectRefillCosts({
      medications: [med({ medicationId: 'm-1', copayCents: 1000, daysSupply: 30, firstFillAt: new Date(2026, 0, 1) })],
      from: new Date(2026, 0, 1),
      to: new Date(2026, 11, 31),
      planChange,
    });
    const s = summarizeRegimenCost(out);
    expect(s).toMatch(/costs.*more/);
  });
});
