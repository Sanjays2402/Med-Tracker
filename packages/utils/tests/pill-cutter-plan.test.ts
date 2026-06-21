import { describe, it, expect } from 'vitest';
import { planPillSplit, type TabletOption } from '../src/pill-cutter-plan';

const SCORED_10MG: TabletOption = { strength: 10, scored: true, label: 'lisinopril 10mg' };
const SCORED_5MG: TabletOption = { strength: 5, scored: true, label: 'lisinopril 5mg' };
const UNSCORED_10MG: TabletOption = { strength: 10, scored: false, label: 'aripiprazole 10mg' };
const CROSS_SCORED_20MG: TabletOption = { strength: 20, scored: true, crossScored: true };
const ER_20MG: TabletOption = { strength: 20, scored: true, extendedRelease: true, label: 'metoprolol XL 20mg' };

describe('planPillSplit', () => {
  it('rejects non-positive target dose', () => {
    expect(() => planPillSplit({ targetDose: 0, tablets: [SCORED_10MG] })).toThrow();
    expect(() => planPillSplit({ targetDose: -5, tablets: [SCORED_10MG] })).toThrow();
  });

  it('returns a clean whole-tablet plan when the target matches exactly', () => {
    const plan = planPillSplit({ targetDose: 10, tablets: [SCORED_10MG] });
    expect(plan.feasible).toBe(true);
    expect(plan.achievedDose).toBe(10);
    expect(plan.deviationRatio).toBe(0);
    expect(plan.pieces).toHaveLength(1);
    expect(plan.pieces[0]?.size).toBe('whole');
    expect(plan.pieces[0]?.count).toBe(1);
    expect(plan.instruction).toContain('whole');
  });

  it('splits a scored tablet in half to hit a fractional target', () => {
    const plan = planPillSplit({ targetDose: 5, tablets: [SCORED_10MG] });
    expect(plan.feasible).toBe(true);
    expect(plan.achievedDose).toBe(5);
    expect(plan.pieces[0]?.size).toBe('half');
    expect(plan.pieces[0]?.count).toBe(1);
    expect(plan.instruction).toContain('half');
  });

  it('quarters a cross-scored tablet when needed', () => {
    const plan = planPillSplit({ targetDose: 5, tablets: [CROSS_SCORED_20MG] });
    expect(plan.feasible).toBe(true);
    expect(plan.achievedDose).toBe(5);
    expect(plan.pieces[0]?.size).toBe('quarter');
    expect(plan.pieces[0]?.count).toBe(1);
  });

  it('refuses to half an unscored tablet (warns + infeasible)', () => {
    const plan = planPillSplit({ targetDose: 5, tablets: [UNSCORED_10MG] });
    // Best LEGAL plan is a single whole 10mg tablet (100% deviation), so
    // not feasible at the default 5% deviation cap. The warning about
    // unsplittable should appear.
    expect(plan.feasible).toBe(false);
    expect(plan.warnings.find((w) => w.kind === 'unsplittable-only-option')).toBeDefined();
  });

  it('refuses to split an ER tablet even when scored', () => {
    const plan = planPillSplit({ targetDose: 10, tablets: [ER_20MG] });
    expect(plan.feasible).toBe(false);
    const er = plan.warnings.find((w) => w.kind === 'extended-release');
    expect(er).toBeDefined();
    expect(er?.note).toMatch(/extended-release/);
  });

  it('prefers a whole-tablet plan over a split when both are exact', () => {
    // Two strengths available: 5mg and 10mg, both scored. Target 5mg.
    // Both "1 whole 5mg" and "half of 10mg" hit exactly. Whole should win.
    const plan = planPillSplit({ targetDose: 5, tablets: [SCORED_10MG, SCORED_5MG] });
    expect(plan.feasible).toBe(true);
    expect(plan.pieces[0]?.strength).toBe(5);
    expect(plan.pieces[0]?.size).toBe('whole');
  });

  it('combines a whole + half across two strengths to reach 15mg', () => {
    const plan = planPillSplit({ targetDose: 15, tablets: [SCORED_10MG, SCORED_5MG] });
    expect(plan.feasible).toBe(true);
    expect(plan.achievedDose).toBe(15);
    expect(plan.pieceCount).toBeLessThanOrEqual(3);
  });

  it('honours maxPiecesPerDose by warning when the only plan exceeds it', () => {
    // Target 25mg with only 5mg tablets and a cap of 4 pieces -> needs 5.
    const plan = planPillSplit({
      targetDose: 25,
      tablets: [SCORED_5MG],
      maxPiecesPerDose: 4,
    });
    // best plan is "4 whole 5mg" = 20mg (20% short, infeasible)
    expect(plan.feasible).toBe(false);
    expect(Math.abs(plan.deviationRatio)).toBeGreaterThan(0.05);
  });

  it('reports zero physical pieces and a sensible message when no tablets are provided', () => {
    const plan = planPillSplit({ targetDose: 10, tablets: [] });
    expect(plan.feasible).toBe(false);
    expect(plan.pieces).toHaveLength(0);
    expect(plan.pieceCount).toBe(0);
    expect(plan.instruction).toMatch(/no tablet/i);
  });

  it('considers cross-scored tablets when only quarters reach the target', () => {
    // Target 7.5mg from a 10mg scored + crossScored tablet.
    // Best: 1 half (5mg) + 1 quarter (2.5mg) = 7.5mg.
    const tab: TabletOption = { strength: 10, scored: true, crossScored: true };
    const plan = planPillSplit({ targetDose: 7.5, tablets: [tab] });
    expect(plan.feasible).toBe(true);
    expect(plan.achievedDose).toBe(7.5);
    expect(plan.pieceCount).toBe(2);
  });

  it('reports a positive deviation when the closest legal plan overshoots', () => {
    // Target 7mg from a scored 10mg tablet (no other strengths).
    // Best halve-split: 5mg (under). Best whole: 10mg (over by 42.9%).
    // Half wins by deviation; deviation should be negative.
    const plan = planPillSplit({ targetDose: 7, tablets: [SCORED_10MG] });
    expect(plan.pieces[0]?.size).toBe('half');
    expect(plan.deviationRatio).toBeLessThan(0);
    // 5% cap broken => infeasible.
    expect(plan.feasible).toBe(false);
  });

  it('allows callers to widen the deviation ratio', () => {
    const plan = planPillSplit({
      targetDose: 7,
      tablets: [SCORED_10MG],
      maxDeviationRatio: 0.35,
    });
    expect(plan.feasible).toBe(true); // 5mg achieved, ~28.6% under
  });

  it('does not penalise unrelated ER tablets the plan never uses', () => {
    // Tablets: scored 10mg + ER 20mg. Target 10mg should use the 10mg
    // whole tablet; the ER warning should be informational (still
    // surfaced) but not block feasibility.
    const plan = planPillSplit({ targetDose: 10, tablets: [SCORED_10MG, ER_20MG] });
    expect(plan.feasible).toBe(true);
    expect(plan.warnings.find((w) => w.kind === 'extended-release')).toBeDefined();
    expect(plan.pieces[0]?.strength).toBe(10);
  });

  it('sorts pieces by strength desc then size desc for stable display', () => {
    const plan = planPillSplit({
      targetDose: 12.5,
      tablets: [
        { strength: 10, scored: true, crossScored: true },
        { strength: 5, scored: true },
      ],
    });
    // Possible composition: 1 whole 10mg + half of 5mg = 12.5mg.
    const sizeOrder = ['whole', 'half', 'quarter'];
    for (let i = 1; i < plan.pieces.length; i++) {
      const prev = plan.pieces[i - 1]!;
      const curr = plan.pieces[i]!;
      if (prev.strength === curr.strength) {
        expect(sizeOrder.indexOf(curr.size)).toBeGreaterThanOrEqual(sizeOrder.indexOf(prev.size));
      } else {
        expect(prev.strength).toBeGreaterThan(curr.strength);
      }
    }
  });

  it('renders human instructions with proper grammar for halves and quarters', () => {
    const halfPlan = planPillSplit({ targetDose: 5, tablets: [SCORED_10MG] });
    expect(halfPlan.instruction).toMatch(/half of/);

    const quarterPlan = planPillSplit({
      targetDose: 2.5,
      tablets: [{ strength: 10, scored: true, crossScored: true }],
    });
    expect(quarterPlan.instruction).toMatch(/quarter/);
  });

  it('falls back to a near-target plan when an exact split is impossible', () => {
    // Target 11mg from a scored 10mg only.
    // Best: 1 whole 10mg (9.1% under, ~within widened 0.1 cap).
    const plan = planPillSplit({
      targetDose: 11,
      tablets: [SCORED_10MG],
      maxDeviationRatio: 0.1,
    });
    expect(plan.feasible).toBe(true);
    expect(plan.achievedDose).toBe(10);
  });

  it('reports physical piece count accurately', () => {
    const plan = planPillSplit({
      targetDose: 17.5,
      tablets: [{ strength: 10, scored: true, crossScored: true }, { strength: 5, scored: true }],
    });
    // 17.5 = 1 whole 10mg + 1 whole 5mg + 1 quarter 10mg = 3 pieces
    // OR 1 whole 10mg + 1 half 5mg + 1 half 10mg = 3 pieces.
    // Whichever wins, pieceCount should equal the sum of piece.count values.
    const total = plan.pieces.reduce((s, p) => s + p.count, 0);
    expect(plan.pieceCount).toBe(total);
  });
});
