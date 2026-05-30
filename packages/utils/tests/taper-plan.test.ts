import { describe, expect, it } from 'vitest';
import { generateTaperPlan } from '../src/taper-plan';

describe('taper plan', () => {
  it('linear taper drops by stepSize each phase', () => {
    const plan = generateTaperPlan({
      medicationId: 'sertraline',
      startDoseMg: 100,
      endDoseMg: 0,
      shape: 'linear',
      stepSize: 25,
      stepDurationDays: 14,
      allowedStrengthsMg: [50, 25],
    });
    expect(plan.phases.map((p) => p.actualDoseMg)).toEqual([75, 50, 25, 0]);
    expect(plan.totalDays).toBe(14 * 4);
    expect(plan.completed).toBe(true);
  });

  it('exponential taper cuts a fixed fraction of current dose', () => {
    const plan = generateTaperPlan({
      medicationId: 'clonazepam',
      startDoseMg: 4,
      endDoseMg: 0,
      shape: 'exponential',
      stepSize: 0.25,
      stepDurationDays: 14,
      allowedStrengthsMg: [1, 0.5, 0.25],
    });
    // First few cuts roughly: 3, 2.25, 1.75, ...
    expect(plan.phases[0].actualDoseMg).toBe(3);
    expect(plan.phases[1].actualDoseMg).toBeLessThan(plan.phases[0].actualDoseMg);
    expect(plan.completed).toBe(true);
    expect(plan.phases[plan.phases.length - 1].actualDoseMg).toBe(0);
  });

  it('respects endDoseMg as floor (not zero)', () => {
    const plan = generateTaperPlan({
      medicationId: 'prednisone',
      startDoseMg: 40,
      endDoseMg: 5,
      shape: 'linear',
      stepSize: 10,
      stepDurationDays: 7,
      allowedStrengthsMg: [10, 5, 1],
    });
    expect(plan.phases[plan.phases.length - 1].actualDoseMg).toBe(5);
    expect(plan.completed).toBe(true);
  });

  it('inserts hold phases at the right cadence', () => {
    const plan = generateTaperPlan({
      medicationId: 'venlafaxine',
      startDoseMg: 150,
      endDoseMg: 0,
      shape: 'linear',
      stepSize: 25,
      stepDurationDays: 7,
      allowedStrengthsMg: [75, 50, 25],
      holdEveryNSteps: 2,
      holdDurationDays: 21,
    });
    const holds = plan.phases.filter((p) => p.hold);
    expect(holds.length).toBeGreaterThan(0);
    for (const h of holds) expect(h.durationDays).toBe(21);
    const nonHolds = plan.phases.filter((p) => !p.hold);
    for (const p of nonHolds) expect(p.durationDays).toBe(7);
  });

  it('units sum to actualDoseMg', () => {
    const plan = generateTaperPlan({
      medicationId: 'm',
      startDoseMg: 60,
      endDoseMg: 0,
      shape: 'linear',
      stepSize: 15,
      stepDurationDays: 7,
      allowedStrengthsMg: [10, 5],
    });
    for (const p of plan.phases) {
      const sum = p.units.reduce((s, u) => s + u.strengthMg * u.count, 0);
      expect(sum).toBeCloseTo(p.actualDoseMg, 6);
    }
  });

  it('rejects invalid requests', () => {
    expect(() =>
      generateTaperPlan({
        medicationId: 'm',
        startDoseMg: 10,
        endDoseMg: 20,
        shape: 'linear',
        stepSize: 1,
        stepDurationDays: 7,
        allowedStrengthsMg: [10],
      }),
    ).toThrow();
    expect(() =>
      generateTaperPlan({
        medicationId: 'm',
        startDoseMg: 10,
        endDoseMg: 0,
        shape: 'exponential',
        stepSize: 1.5,
        stepDurationDays: 7,
        allowedStrengthsMg: [1],
      }),
    ).toThrow();
    expect(() =>
      generateTaperPlan({
        medicationId: 'm',
        startDoseMg: 10,
        endDoseMg: 0,
        shape: 'linear',
        stepSize: 1,
        stepDurationDays: 7,
        allowedStrengthsMg: [],
      }),
    ).toThrow();
  });

  it('honors maxSteps cap', () => {
    const plan = generateTaperPlan({
      medicationId: 'm',
      startDoseMg: 1000,
      endDoseMg: 0,
      shape: 'exponential',
      stepSize: 0.05,
      stepDurationDays: 7,
      allowedStrengthsMg: [100, 50, 25, 10, 5, 1],
      maxSteps: 5,
    });
    expect(plan.phases.length).toBeLessThanOrEqual(5);
  });

  it('phases are monotonically non-increasing', () => {
    const plan = generateTaperPlan({
      medicationId: 'm',
      startDoseMg: 80,
      endDoseMg: 0,
      shape: 'linear',
      stepSize: 10,
      stepDurationDays: 7,
      allowedStrengthsMg: [40, 20, 10, 5],
    });
    for (let i = 1; i < plan.phases.length; i++) {
      expect(plan.phases[i].actualDoseMg).toBeLessThanOrEqual(plan.phases[i - 1].actualDoseMg);
    }
  });
});
