import { describe, it, expect } from 'vitest';
import { adherenceForMedication, adherenceSummary, type RefillEvent } from '../src/adherence-metrics';

const window90 = { start: new Date('2026-01-01T00:00:00.000Z'), end: new Date('2026-03-31T00:00:00.000Z') };
const windowDaysExpected = 90; // Jan(31)+Feb(28)+Mar(31) - inclusive start/end = 90

describe('adherence metrics', () => {
  it('returns zeros for no refills', () => {
    const m = adherenceForMedication('m', [], window90);
    expect(m.pdc).toBe(0);
    expect(m.mpr).toBe(0);
    expect(m.daysCovered).toBe(0);
    expect(m.gaps).toHaveLength(1);
    expect(m.gaps[0]!.days).toBe(windowDaysExpected);
  });

  it('full coverage gives pdc 1.0 and mpr ~1.0', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'm', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 90 },
    ];
    const m = adherenceForMedication('m', refills, window90);
    expect(m.pdc).toBe(1);
    expect(m.mpr).toBe(1);
    expect(m.gaps).toEqual([]);
  });

  it('overlapping refills inflate MPR but not PDC', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'm', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 30 },
      { medicationId: 'm', filledAt: '2026-01-15T00:00:00.000Z', daySupply: 30 },
      { medicationId: 'm', filledAt: '2026-02-15T00:00:00.000Z', daySupply: 30 },
      { medicationId: 'm', filledAt: '2026-03-15T00:00:00.000Z', daySupply: 30 },
    ];
    const m = adherenceForMedication('m', refills, window90);
    expect(m.mpr).toBeGreaterThan(1);
    expect(m.mprCapped).toBe(1);
    // 4x 30-day fills (Jan1, Jan15, Feb15, Mar15) leave a single uncovered day (Feb 14).
    expect(m.pdc).toBeCloseTo(89 / 90, 3);
    expect(m.daysCovered).toBe(89);
  });

  it('detects gaps between refills', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'm', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 30 },
      { medicationId: 'm', filledAt: '2026-02-15T00:00:00.000Z', daySupply: 30 },
    ];
    const m = adherenceForMedication('m', refills, window90);
    // Jan 1 to Jan 30 covered, Jan 31 to Feb 14 gap (15 days), Feb 15 to Mar 16 covered
    expect(m.gaps).toHaveLength(2);
    expect(m.gaps[0]!.days).toBe(15);
    expect(m.daysCovered).toBe(60 + 1 - 1); // 30 + 30 = 60 (no overlap)
    expect(m.pdc).toBeCloseTo(60 / 90, 2);
  });

  it('clips refills that start before the window', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'm', filledAt: '2025-12-25T00:00:00.000Z', daySupply: 30 },
    ];
    const m = adherenceForMedication('m', refills, window90);
    // covers Jan 1 through Jan 23 inclusive => 23 days
    expect(m.daysCovered).toBe(23);
  });

  it('clips refills that extend past the window', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'm', filledAt: '2026-03-15T00:00:00.000Z', daySupply: 30 },
    ];
    const m = adherenceForMedication('m', refills, window90);
    // Mar 15 to Mar 31 inclusive => 17 days
    expect(m.daysCovered).toBe(17);
  });

  it('ignores refills for other medications', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'other', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 90 },
    ];
    const m = adherenceForMedication('m', refills, window90);
    expect(m.pdc).toBe(0);
  });

  it('summary classifies adherent by CMS 0.80 threshold', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'a', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 90 },
      { medicationId: 'b', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 30 },
    ];
    const s = adherenceSummary(['a', 'b'], refills, window90);
    expect(s.adherentCount).toBe(1);
    expect(s.nonAdherentCount).toBe(1);
    expect(s.threshold).toBe(0.8);
  });

  it('summary respects custom threshold', () => {
    const refills: RefillEvent[] = [
      { medicationId: 'a', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 30 },
    ];
    const s = adherenceSummary(['a'], refills, window90, { threshold: 0.3 });
    expect(s.adherentCount).toBe(1);
  });
});
