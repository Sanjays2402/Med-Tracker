import { describe, it, expect } from 'vitest';
import { roundToDispensableDose, type TabletLadder, type StepLadder } from '../src/dose-rounding';

describe('roundToDispensableDose tablets', () => {
  const amox: TabletLadder = {
    kind: 'tablet',
    strengths: [250, 500, 875, 1000],
    splits: ['whole', 'half'],
    maxPiecesPerDose: 4,
  };

  it('matches a single tablet exactly', () => {
    const out = roundToDispensableDose({ targetDose: 500, ladder: amox });
    expect(out.roundedDose).toBe(500);
    expect(out.deviationRatio).toBe(0);
    expect(out.pieces).toEqual([{ strength: 500, fraction: 1, count: 1 }]);
    expect(out.withinDeviation).toBe(true);
    expect(out.withinSafetyBounds).toBe(true);
  });

  it('combines a whole and a half tablet', () => {
    // Target 625 mg = one 500 + half 250.
    const out = roundToDispensableDose({ targetDose: 625, ladder: amox });
    expect(out.roundedDose).toBe(625);
    expect(out.pieces).toEqual(expect.arrayContaining([
      { strength: 500, fraction: 1, count: 1 },
      { strength: 250, fraction: 0.5, count: 1 },
    ]));
    expect(out.withinDeviation).toBe(true);
  });

  it('uses halves when splits allow', () => {
    const out = roundToDispensableDose({ targetDose: 125, ladder: amox });
    expect(out.roundedDose).toBe(125);
    expect(out.pieces).toEqual([{ strength: 250, fraction: 0.5, count: 1 }]);
  });

  it('refuses dose above safety ceiling', () => {
    const out = roundToDispensableDose({
      targetDose: 4000, ladder: amox, maxAllowed: 3000, maxDeviationRatio: 0.5,
    });
    expect(out.withinSafetyBounds).toBe(false);
    expect(out.reason).toMatch(/ceiling/);
  });

  it('refuses dose below safety floor', () => {
    const out = roundToDispensableDose({
      targetDose: 100, ladder: amox, minAllowed: 200, maxDeviationRatio: 0.5,
    });
    expect(out.withinSafetyBounds).toBe(false);
    expect(out.reason).toMatch(/floor/);
  });

  it('flags excessive deviation', () => {
    // 233 mg target, ladder is too coarse; max dev 1% should fail.
    const out = roundToDispensableDose({
      targetDose: 233, ladder: { kind: 'tablet', strengths: [250, 500] }, maxDeviationRatio: 0.01,
    });
    expect(out.withinDeviation).toBe(false);
    expect(out.reason).toMatch(/exceeds/);
  });

  it('respects no-splits constraint', () => {
    const ladder: TabletLadder = { kind: 'tablet', strengths: [250, 500] };
    const out = roundToDispensableDose({ targetDose: 125, ladder, maxDeviationRatio: 1 });
    // closest with whole-only is 250
    expect(out.roundedDose).toBe(250);
    expect(out.pieces).toEqual([{ strength: 250, fraction: 1, count: 1 }]);
  });

  it('respects maxPiecesPerDose ceiling', () => {
    const ladder: TabletLadder = { kind: 'tablet', strengths: [100], maxPiecesPerDose: 2 };
    const out = roundToDispensableDose({ targetDose: 500, ladder, maxDeviationRatio: 1 });
    expect(out.roundedDose).toBe(200);
    const totalPieces = out.pieces!.reduce((s, p) => s + p.count, 0);
    expect(totalPieces).toBeLessThanOrEqual(2);
  });
});

describe('roundToDispensableDose step ladders', () => {
  const syringe: StepLadder = { kind: 'liquid', step: 0.1, minStep: 0.5, maxStep: 10 };

  it('rounds to nearest 0.1 mL', () => {
    const out = roundToDispensableDose({ targetDose: 1.34, ladder: syringe });
    expect(out.roundedDose).toBe(1.3);
    expect(out.stepCount).toBe(13);
    expect(out.withinDeviation).toBe(true);
  });

  it('rounds up to minStep when below', () => {
    const out = roundToDispensableDose({ targetDose: 0.2, ladder: syringe, maxDeviationRatio: 2 });
    expect(out.roundedDose).toBe(0.5);
    expect(out.stepCount).toBe(5);
  });

  it('caps at maxStep', () => {
    const out = roundToDispensableDose({ targetDose: 25, ladder: syringe, maxDeviationRatio: 1 });
    expect(out.roundedDose).toBe(10);
    expect(out.stepCount).toBe(100);
  });

  it('respects safety ceiling on step ladder', () => {
    const out = roundToDispensableDose({
      targetDose: 8, ladder: syringe, maxAllowed: 5,
    });
    expect(out.withinSafetyBounds).toBe(false);
  });

  it('flags step deviation beyond allowance', () => {
    const ladder: StepLadder = { kind: 'pen', step: 1, minStep: 1 };
    const out = roundToDispensableDose({ targetDose: 1.6, ladder, maxDeviationRatio: 0.05 });
    // nearest is 2, deviation 25% > 5%.
    expect(out.withinDeviation).toBe(false);
  });

  it('throws on bad inputs', () => {
    expect(() => roundToDispensableDose({ targetDose: 0, ladder: syringe })).toThrow(/positive/);
    expect(() => roundToDispensableDose({
      targetDose: 10, ladder: { kind: 'liquid', step: 0 } as StepLadder,
    })).toThrow(/step/);
  });
});
