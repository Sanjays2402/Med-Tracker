import { describe, expect, it } from 'vitest';
import {
  type LedgerState,
  availableUnits,
  planFefoDraw,
  recallImpact,
  recordDose,
  summarizeLots,
} from '../src/inventory-ledger';

function baseState(): LedgerState {
  return {
    lots: [
      {
        lotNumber: 'B',
        medicationId: 'med1',
        ndc: '0001-2222',
        receivedUnits: 30,
        expiresOn: '2025-06-30',
        receivedAt: '2025-01-01T00:00:00Z',
      },
      {
        lotNumber: 'A',
        medicationId: 'med1',
        ndc: '0001-1111',
        receivedUnits: 10,
        expiresOn: '2025-03-15',
        receivedAt: '2025-01-02T00:00:00Z',
      },
      {
        lotNumber: 'C',
        medicationId: 'med2',
        receivedUnits: 60,
        expiresOn: '2026-01-31',
        receivedAt: '2025-02-01T00:00:00Z',
      },
    ],
    consumption: [],
    recalls: [],
  };
}

describe('inventory ledger', () => {
  it('summarizes lots sorted by expiry then lotNumber', () => {
    const s = summarizeLots(baseState(), '2025-02-01T00:00:00Z');
    expect(s.map((l) => l.lotNumber)).toEqual(['A', 'B', 'C']);
    expect(s.every((l) => l.available)).toBe(true);
  });

  it('flags expired lots as unavailable', () => {
    const s = summarizeLots(baseState(), '2025-04-01T00:00:00Z');
    const a = s.find((l) => l.lotNumber === 'A')!;
    expect(a.expired).toBe(true);
    expect(a.available).toBe(false);
  });

  it('treats expiry as end-of-day inclusive', () => {
    const before = summarizeLots(baseState(), '2025-03-15T23:00:00Z');
    expect(before.find((l) => l.lotNumber === 'A')!.expired).toBe(false);
    const after = summarizeLots(baseState(), '2025-03-16T00:00:01Z');
    expect(after.find((l) => l.lotNumber === 'A')!.expired).toBe(true);
  });

  it('planFefoDraw pulls from earliest-expiring lot first', () => {
    const draw = planFefoDraw(baseState(), 'med1', 7, '2025-02-01T00:00:00Z');
    expect(draw).toEqual({ draws: [{ lotNumber: 'A', units: 7 }], shortfall: 0 });
  });

  it('planFefoDraw spans lots when one is exhausted', () => {
    const draw = planFefoDraw(baseState(), 'med1', 15, '2025-02-01T00:00:00Z');
    expect(draw.draws).toEqual([
      { lotNumber: 'A', units: 10 },
      { lotNumber: 'B', units: 5 },
    ]);
    expect(draw.shortfall).toBe(0);
  });

  it('planFefoDraw skips expired lots and reports shortfall', () => {
    const draw = planFefoDraw(baseState(), 'med1', 35, '2025-04-01T00:00:00Z');
    // A is expired; only 30 from B available.
    expect(draw.draws).toEqual([{ lotNumber: 'B', units: 30 }]);
    expect(draw.shortfall).toBe(5);
  });

  it('recordDose commits consumption and reduces available units', () => {
    const s0 = baseState();
    const { state: s1 } = recordDose(s0, {
      doseId: 'd1',
      medicationId: 'med1',
      units: 12,
      takenAt: '2025-02-01T08:00:00Z',
    });
    expect(availableUnits(s1, 'med1', '2025-02-01T08:00:00Z')).toBe(40 - 12);
    const a = summarizeLots(s1, '2025-02-01T08:00:00Z').find((l) => l.lotNumber === 'A')!;
    expect(a.remainingUnits).toBe(0);
  });

  it('availableUnits excludes recalled lots', () => {
    const s = baseState();
    s.recalls.push({ lotNumber: 'A', issuedAt: '2025-02-10T00:00:00Z', reason: 'mislabel' });
    expect(availableUnits(s, 'med1', '2025-02-15T00:00:00Z')).toBe(30);
  });

  it('recallImpact matches by NDC and lists exposed doses', () => {
    let s = baseState();
    ({ state: s } = recordDose(s, {
      doseId: 'd1',
      medicationId: 'med1',
      units: 5,
      takenAt: '2025-02-01T08:00:00Z',
    }));
    s.recalls.push({ ndc: '0001-1111', issuedAt: '2025-02-10T00:00:00Z', reason: 'contamination' });
    const impact = recallImpact(s);
    expect(impact).toHaveLength(1);
    expect(impact[0].affectedLots).toEqual(['A']);
    expect(impact[0].exposedDoses).toHaveLength(1);
    expect(impact[0].exposedDoses[0].doseId).toBe('d1');
    expect(impact[0].quarantinedUnits).toBe(5);
  });

  it('FEFO draw after recall skips the recalled lot', () => {
    const s = baseState();
    s.recalls.push({ lotNumber: 'A', issuedAt: '2025-02-10T00:00:00Z', reason: 'mislabel' });
    const draw = planFefoDraw(s, 'med1', 4, '2025-02-15T00:00:00Z');
    expect(draw.draws).toEqual([{ lotNumber: 'B', units: 4 }]);
  });

  it('handles zero and negative draw requests', () => {
    expect(planFefoDraw(baseState(), 'med1', 0, '2025-02-01T00:00:00Z')).toEqual({
      draws: [],
      shortfall: 0,
    });
    expect(planFefoDraw(baseState(), 'med1', -3, '2025-02-01T00:00:00Z')).toEqual({
      draws: [],
      shortfall: 0,
    });
  });

  it('summarizeLots reflects per-lot consumption totals', () => {
    let s = baseState();
    ({ state: s } = recordDose(s, {
      doseId: 'd1',
      medicationId: 'med1',
      units: 3,
      takenAt: '2025-02-01T08:00:00Z',
    }));
    ({ state: s } = recordDose(s, {
      doseId: 'd2',
      medicationId: 'med1',
      units: 4,
      takenAt: '2025-02-02T08:00:00Z',
    }));
    const a = summarizeLots(s, '2025-02-03T00:00:00Z').find((l) => l.lotNumber === 'A')!;
    expect(a.consumedUnits).toBe(7);
    expect(a.remainingUnits).toBe(3);
  });
});
