import { describe, it, expect } from 'vitest';
import {
  evaluatePrnBudget,
  projectRemainingDoses,
  type PrnDose,
  type PrnBudgetSpec,
} from '../src/prn-budget';

const at = (offsetH: number): string => {
  const base = new Date('2026-06-20T12:00:00Z');
  return new Date(base.getTime() + offsetH * 3_600_000).toISOString();
};

describe('evaluatePrnBudget count-window', () => {
  const albuterol: PrnBudgetSpec = {
    label: 'Albuterol rescue',
    maxDoses: 4,
    windowHours: 24,
  };

  it('allows new dose when no prior doses', () => {
    const r = evaluatePrnBudget({
      doses: [],
      spec: albuterol,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('allowed');
    expect(r.remainingInWindow).toBe(4);
    expect(r.countInWindow).toBe(0);
  });

  it('reports remaining as cap minus count', () => {
    const r = evaluatePrnBudget({
      doses: [{ takenAt: at(-2) }, { takenAt: at(-10) }],
      spec: albuterol,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('allowed');
    expect(r.remainingInWindow).toBe(2);
    expect(r.countInWindow).toBe(2);
  });

  it('denies at the cap and reports rolloff time', () => {
    const r = evaluatePrnBudget({
      doses: [
        { takenAt: at(-1) },
        { takenAt: at(-5) },
        { takenAt: at(-10) },
        { takenAt: at(-23) }, // oldest, rolls off at +1h
      ],
      spec: albuterol,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('denied-cap');
    expect(r.remainingInWindow).toBe(0);
    expect(r.nextEligibleAt).toBe(at(1));
    expect(r.minutesUntilEligible).toBe(60);
    expect(r.reason).toMatch(/At cap/);
  });

  it('excludes doses outside the window', () => {
    const r = evaluatePrnBudget({
      doses: [
        { takenAt: at(-30) }, // outside 24h window
        { takenAt: at(-25) }, // outside 24h window
        { takenAt: at(-2) }, // inside
      ],
      spec: albuterol,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.countInWindow).toBe(1);
    expect(r.remainingInWindow).toBe(3);
  });
});

describe('evaluatePrnBudget interval-only', () => {
  const triptan: PrnBudgetSpec = {
    label: 'Sumatriptan',
    minIntervalHours: 2,
  };

  it('allows when no prior doses', () => {
    const r = evaluatePrnBudget({
      doses: [],
      spec: triptan,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('allowed');
    expect(r.nextEligibleAt).toBeUndefined();
  });

  it('blocks with wait when too soon since last', () => {
    const r = evaluatePrnBudget({
      doses: [{ takenAt: at(-1) }], // last dose 1h ago, need 2h
      spec: triptan,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('wait');
    expect(r.minutesUntilEligible).toBe(60);
    expect(r.reason).toMatch(/interval not yet elapsed/);
  });

  it('allows when interval has elapsed', () => {
    const r = evaluatePrnBudget({
      doses: [{ takenAt: at(-3) }],
      spec: triptan,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('allowed');
  });
});

describe('evaluatePrnBudget combined cap + interval', () => {
  const combined: PrnBudgetSpec = {
    label: 'Sumatriptan combined',
    maxDoses: 2,
    windowHours: 24,
    minIntervalHours: 2,
  };

  it('uses the LATER constraint as nextEligibleAt', () => {
    // Two doses in window: at cap. Last one 30m ago, interval needs 2h.
    const r = evaluatePrnBudget({
      doses: [{ takenAt: at(-23) }, { takenAt: at(-0.5) }],
      spec: combined,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('denied-cap');
    // Cap rolloff: oldest at -23h rolls off in +1h.
    // Interval: last at -0.5h, ready in +1.5h.
    // LATER = +1.5h.
    expect(r.nextEligibleAt).toBe(at(1.5));
  });

  it('honors interval-only wait when below cap', () => {
    const r = evaluatePrnBudget({
      doses: [{ takenAt: at(-1) }],
      spec: combined,
      now: new Date('2026-06-20T12:00:00Z'),
    });
    expect(r.decision).toBe('wait');
    expect(r.remainingInWindow).toBe(1);
    expect(r.minutesUntilEligible).toBe(60);
  });
});

describe('projectRemainingDoses', () => {
  it('returns remaining count for count-window specs', () => {
    expect(
      projectRemainingDoses({
        doses: [{ takenAt: at(-2) }],
        spec: { maxDoses: 4, windowHours: 24 },
        now: new Date('2026-06-20T12:00:00Z'),
      }),
    ).toBe(3);
  });

  it('returns Infinity for interval-only specs', () => {
    expect(
      projectRemainingDoses({
        doses: [{ takenAt: at(-3) }],
        spec: { minIntervalHours: 2 },
        now: new Date('2026-06-20T12:00:00Z'),
      }),
    ).toBe(Infinity);
  });
});
