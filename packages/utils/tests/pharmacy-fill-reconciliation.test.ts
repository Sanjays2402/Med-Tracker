import { describe, it, expect } from 'vitest';
import {
  reconcileFills,
  summarizeReconciliation,
  type ReconFillEvent,
  type ExpectedFillSpec,
} from '../src/pharmacy-fill-reconciliation';

function fill(o: Partial<ReconFillEvent>): ReconFillEvent {
  return {
    fillId: o.fillId ?? `f-${Math.random().toString(36).slice(2, 8)}`,
    medicationId: o.medicationId ?? 'm1',
    filledAt: o.filledAt ?? new Date(2026, 0, 1),
    actualUnits: o.actualUnits ?? 30,
  };
}

function spec(o: Partial<ExpectedFillSpec>): ExpectedFillSpec {
  return {
    medicationId: o.medicationId ?? 'm1',
    expectedUnitsPerFill: o.expectedUnitsPerFill ?? 30,
    dailyUsage: o.dailyUsage ?? 1,
  };
}

describe('reconcileFills — classification', () => {
  it('classifies a single on-time, correct-quantity fill as ok', () => {
    const r = reconcileFills(
      [fill({ filledAt: new Date(2026, 0, 1), actualUnits: 30 })],
      [spec({})],
    );
    expect(r.perFill).toHaveLength(1);
    expect(r.perFill[0]?.kind).toBe('ok');
    expect(r.perFill[0]?.delta).toBe(0);
  });

  it('flags a short fill', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 31), actualUnits: 15 }), // partial
      ],
      [spec({})],
    );
    const second = r.perFill.find((f) => f.fillId === 'f2')!;
    expect(second.kind).toBe('short-fill');
    expect(second.delta).toBe(-15);
  });

  it('flags an over fill', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 31), actualUnits: 40 }),
      ],
      [spec({})],
    );
    const second = r.perFill.find((f) => f.fillId === 'f2')!;
    expect(second.kind).toBe('over-fill');
    expect(second.delta).toBe(10);
  });

  it('flags a late refill (filled after running out)', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        // 30 days of supply gone by Jan 31, but next fill arrives Feb 10
        fill({ fillId: 'f2', filledAt: new Date(2026, 1, 10), actualUnits: 30 }),
      ],
      [spec({})],
    );
    const second = r.perFill.find((f) => f.fillId === 'f2')!;
    expect(second.kind).toBe('late-refill');
    expect(second.onHandBeforeFill).toBe(0);
    expect(second.daysLate).toBeGreaterThan(0);
  });

  it('flags an early refill (filled with too much on hand)', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 10), actualUnits: 30 }), // 21 days still on hand
      ],
      [spec({})],
    );
    const second = r.perFill.find((f) => f.fillId === 'f2')!;
    expect(second.kind).toBe('early-refill');
    expect(second.daysOfSupplyBeforeFill).toBeGreaterThan(7);
  });

  it('flags a duplicate fill on the same day', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
      ],
      [spec({})],
    );
    const second = r.perFill.find((f) => f.fillId === 'f2')!;
    expect(second.kind).toBe('duplicate-fill');
  });

  it('honors unitTolerance for short/over classification', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 31), actualUnits: 28 }),
      ],
      [spec({})],
      { unitTolerance: 5 },
    );
    expect(r.perFill.find((f) => f.fillId === 'f2')?.kind).toBe('ok');
  });

  it('respects startingInventory option', () => {
    const r = reconcileFills(
      [
        // Patient walks in with 30 days on hand from a prior period.
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
      ],
      [spec({})],
      { startingInventory: { m1: 30 } },
    );
    // No prior fill -> early-refill rule needs lastFillMs; so classification
    // is ok. But onHandBefore should reflect startingInventory.
    expect(r.perFill[0]?.onHandBeforeFill).toBe(30);
  });
});

describe('reconcileFills — multi-medication summary', () => {
  it('counts per-kind for each medication', () => {
    const r = reconcileFills(
      [
        // m-a: 1 short, 1 ok
        fill({ fillId: 'fa1', medicationId: 'm-a', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'fa2', medicationId: 'm-a', filledAt: new Date(2026, 0, 31), actualUnits: 15 }),
        // m-b: 1 late, 1 ok
        fill({ fillId: 'fb1', medicationId: 'm-b', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'fb2', medicationId: 'm-b', filledAt: new Date(2026, 1, 15), actualUnits: 30 }),
      ],
      [spec({ medicationId: 'm-a' }), spec({ medicationId: 'm-b' })],
    );
    const a = r.perMedication.find((p) => p.medicationId === 'm-a')!;
    const b = r.perMedication.find((p) => p.medicationId === 'm-b')!;
    expect(a.byKind['short-fill']).toBe(1);
    expect(a.netShortfallUnits).toBe(15);
    expect(b.byKind['late-refill']).toBe(1);
    expect(r.flaggedCount).toBe(2);
  });

  it('netShortfallUnits + netOverageUnits accumulate', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 31), actualUnits: 20 }), // -10
        fill({ fillId: 'f3', filledAt: new Date(2026, 1, 20), actualUnits: 40 }), // +10 BUT will be late or early
      ],
      [spec({})],
    );
    const sum = r.perMedication[0]!;
    expect(sum.netShortfallUnits).toBe(10);
  });

  it('skips medications with no spec', () => {
    const r = reconcileFills(
      [fill({ medicationId: 'ghost', actualUnits: 30 })],
      [], // no specs
    );
    expect(r.perFill).toHaveLength(0);
  });

  it('handles empty fills', () => {
    const r = reconcileFills([], [spec({})]);
    expect(r.perFill).toHaveLength(0);
    expect(r.flaggedCount).toBe(0);
  });
});

describe('summarizeReconciliation', () => {
  it('reports all-ok when nothing flagged', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 31), actualUnits: 30 }),
      ],
      [spec({})],
    );
    expect(summarizeReconciliation(r)).toContain('match expected supply');
  });

  it('reports flag counts by kind in the headline', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 0, 31), actualUnits: 15 }),
        fill({ fillId: 'f3', filledAt: new Date(2026, 1, 20), actualUnits: 30 }),
      ],
      [spec({})],
    );
    const s = summarizeReconciliation(r);
    expect(s).toContain('flagged');
    expect(s).toMatch(/short fill|late refill/);
  });

  it('handles empty report', () => {
    expect(summarizeReconciliation({ perFill: [], perMedication: [], flaggedCount: 0 })).toBe(
      'No fills to reconcile.',
    );
  });
});

describe('reconcileFills — daily usage edge cases', () => {
  it('treats dailyUsage=0 as never running out', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
        fill({ fillId: 'f2', filledAt: new Date(2026, 5, 1), actualUnits: 30 }), // 5 months later
      ],
      [spec({ dailyUsage: 0 })],
    );
    // dailyUsage 0 -> infinite days of supply -> NOT late.
    expect(r.perFill.find((f) => f.fillId === 'f2')?.kind).toBe('early-refill');
  });

  it('handles ascending fill order even if input is shuffled', () => {
    const r = reconcileFills(
      [
        fill({ fillId: 'f2', filledAt: new Date(2026, 1, 10), actualUnits: 30 }),
        fill({ fillId: 'f1', filledAt: new Date(2026, 0, 1), actualUnits: 30 }),
      ],
      [spec({})],
    );
    // f1 should be first chronologically.
    expect(r.perFill[0]?.fillId).toBe('f1');
  });
});
