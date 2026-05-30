import { describe, it, expect } from 'vitest';
import {
  activeStepOn,
  doseOn,
  nextDoseChange,
  planDurationDays,
  planTimeline,
  validatePlan,
  TitrationPlanError,
  type TitrationPlan,
} from '../src/titration';

const taper: TitrationPlan = {
  id: 'p1',
  medicationId: 'm1',
  startDate: '2026-06-01',
  steps: [
    { dose: 20, unit: 'mg', durationDays: 7 },
    { dose: 10, unit: 'mg', durationDays: 7 },
    { dose: 5, unit: 'mg', durationDays: 7, note: 'final week before stopping' },
  ],
};

const maintenance: TitrationPlan = {
  id: 'p2',
  medicationId: 'm2',
  startDate: '2026-06-01',
  steps: [
    { dose: 5, unit: 'mg', durationDays: 3 },
    { dose: 10, unit: 'mg', durationDays: 3 },
    { dose: 20, unit: 'mg', durationDays: null },
  ],
};

describe('titration validatePlan', () => {
  it('requires at least one step', () => {
    expect(() => validatePlan({ id: 'x', medicationId: 'm', startDate: '2026-01-01', steps: [] })).toThrow(
      TitrationPlanError,
    );
  });
  it('rejects null duration on non-final step', () => {
    expect(() =>
      validatePlan({
        id: 'x',
        medicationId: 'm',
        startDate: '2026-01-01',
        steps: [
          { dose: 1, unit: 'mg', durationDays: null },
          { dose: 2, unit: 'mg', durationDays: 7 },
        ],
      }),
    ).toThrow(/final step/);
  });
  it('rejects negative dose', () => {
    expect(() =>
      validatePlan({
        id: 'x',
        medicationId: 'm',
        startDate: '2026-01-01',
        steps: [{ dose: -1, unit: 'mg', durationDays: 1 }],
      }),
    ).toThrow(/dose/);
  });
});

describe('titration activeStepOn', () => {
  it('returns null before start', () => {
    expect(activeStepOn(taper, new Date(2026, 4, 31, 12, 0))).toBeNull();
  });
  it('selects first step on day 0', () => {
    const a = activeStepOn(taper, new Date(2026, 5, 1, 8, 0))!;
    expect(a.index).toBe(0);
    expect(a.dayInStep).toBe(0);
    expect(a.step.dose).toBe(20);
  });
  it('selects last day of step inclusively', () => {
    const a = activeStepOn(taper, new Date(2026, 5, 7, 23, 0))!;
    expect(a.index).toBe(0);
    expect(a.dayInStep).toBe(6);
  });
  it('rolls into next step the following day', () => {
    const a = activeStepOn(taper, new Date(2026, 5, 8, 0, 0, 1))!;
    expect(a.index).toBe(1);
    expect(a.step.dose).toBe(10);
    expect(a.dayInStep).toBe(0);
  });
  it('returns null past the finite end', () => {
    expect(activeStepOn(taper, new Date(2026, 5, 22))).toBeNull();
  });
  it('sustains the maintenance step indefinitely', () => {
    const a = activeStepOn(maintenance, new Date(2027, 0, 15))!;
    expect(a.index).toBe(2);
    expect(a.endsOn).toBeNull();
    expect(a.step.dose).toBe(20);
  });
});

describe('titration doseOn', () => {
  it('matches activeStepOn output', () => {
    expect(doseOn(taper, new Date(2026, 5, 10))).toEqual({ dose: 10, unit: 'mg' });
  });
  it('returns null off-plan', () => {
    expect(doseOn(taper, new Date(2026, 6, 1))).toBeNull();
  });
});

describe('titration planTimeline', () => {
  it('emits a row per in-plan day', () => {
    const rows = planTimeline(taper, new Date(2026, 5, 6), new Date(2026, 5, 9));
    expect(rows.map((r) => r.dose)).toEqual([20, 20, 10, 10]);
    expect(rows[0].date).toBe('2026-06-06');
  });
  it('skips days outside the plan', () => {
    const rows = planTimeline(taper, new Date(2026, 4, 30), new Date(2026, 5, 2));
    expect(rows.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02']);
  });
});

describe('titration nextDoseChange', () => {
  it('reports the upcoming step transition', () => {
    const next = nextDoseChange(taper, new Date(2026, 5, 5))!;
    expect(next.fromDose).toBe(20);
    expect(next.toDose).toBe(10);
    expect(next.date.getFullYear()).toBe(2026);
    expect(next.date.getMonth()).toBe(5);
    expect(next.date.getDate()).toBe(8);
  });
  it('returns null after the last transition', () => {
    expect(nextDoseChange(taper, new Date(2026, 5, 20))).toBeNull();
  });
  it('returns null when the trailing step is open-ended and reached', () => {
    expect(nextDoseChange(maintenance, new Date(2026, 5, 15))).toBeNull();
  });
});

describe('titration planDurationDays', () => {
  it('sums finite steps', () => {
    expect(planDurationDays(taper)).toBe(21);
  });
  it('returns null for open-ended plans', () => {
    expect(planDurationDays(maintenance)).toBeNull();
  });
});
