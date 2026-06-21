import { describe, it, expect } from 'vitest';
import {
  computePdc,
  pdcBand,
  summarizePdc,
} from '../src/pdc-by-medication';
import type { FillEvent } from '../src/prescription-fill-history';

function fill(o: Partial<FillEvent>): FillEvent {
  return {
    medicationId: o.medicationId ?? 'm1',
    ndc: o.ndc,
    fillDate: o.fillDate ?? new Date(2026, 0, 1),
    daysSupply: o.daysSupply ?? 30,
  };
}

describe('pdcBand', () => {
  it('bands at the CMS Star cutoffs', () => {
    expect(pdcBand(0.95)).toBe('excellent');
    expect(pdcBand(0.9)).toBe('excellent');
    expect(pdcBand(0.85)).toBe('good');
    expect(pdcBand(0.8)).toBe('good');
    expect(pdcBand(0.79)).toBe('watch');
    expect(pdcBand(0.5)).toBe('watch');
    expect(pdcBand(0.49)).toBe('critical');
    expect(pdcBand(0)).toBe('critical');
  });
});

describe('computePdc — basic adherence', () => {
  const PERIOD_START = new Date(2026, 0, 1);
  const PERIOD_END = new Date(2026, 11, 31); // Dec 31 2026 — 365 days

  it('reports PDC=1.0 for a continuously-filled medication', () => {
    // 13 fills, 30 days each = ~390 days of coverage starting Jan 1 ->
    // fully covers the 365-day measurement period.
    const fills: FillEvent[] = [];
    for (let i = 0; i < 13; i++) {
      fills.push(fill({ fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }));
    }
    const report = computePdc(fills, {
      measurementStart: PERIOD_START,
      measurementEnd: PERIOD_END,
    });
    expect(report.perMedication).toHaveLength(1);
    const m = report.perMedication[0]!;
    expect(m.anchorDate).toBe('2026-01-01');
    expect(m.pdc).toBe(1);
    expect(m.adherent).toBe(true);
    expect(m.numerator).toBe(m.denominator);
  });

  it('reports correct denominator from anchor (NOT period start)', () => {
    // First fill on April 1 -> denominator is Apr 1 through Dec 31.
    const fills: FillEvent[] = [fill({ fillDate: new Date(2026, 3, 1), daysSupply: 30 })];
    const report = computePdc(fills, {
      measurementStart: PERIOD_START,
      measurementEnd: PERIOD_END,
    });
    const m = report.perMedication[0]!;
    expect(m.anchorDate).toBe('2026-04-01');
    // Apr 1 through Dec 31 = 275 days inclusive.
    expect(m.denominator).toBe(275);
    expect(m.numerator).toBe(30);
    expect(m.pdc).toBeCloseTo(30 / 275, 3);
  });

  it('caps PDC at 1.0 when patient stockpiles (no double-count)', () => {
    // Two 30-day fills 20 days apart -> 60 days of coverage from Jan 1
    // through Mar 1, NOT 60 days from Jan 1 + 60 from Jan 20.
    const fills: FillEvent[] = [
      fill({ fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ fillDate: new Date(2026, 0, 20), daysSupply: 30 }),
    ];
    const report = computePdc(fills, {
      measurementStart: PERIOD_START,
      measurementEnd: new Date(2026, 2, 1), // Mar 1
    });
    const m = report.perMedication[0]!;
    expect(m.pdc).toBe(1);
  });

  it('classifies as non-adherent below the threshold', () => {
    // Only one 30-day fill in a 365-day measurement period.
    const fills: FillEvent[] = [fill({ fillDate: new Date(2026, 0, 1), daysSupply: 30 })];
    const report = computePdc(fills, {
      measurementStart: PERIOD_START,
      measurementEnd: PERIOD_END,
    });
    const m = report.perMedication[0]!;
    expect(m.pdc).toBeCloseTo(30 / 365, 3);
    expect(m.adherent).toBe(false);
  });

  it('honors a custom adherentThreshold', () => {
    const fills: FillEvent[] = [
      fill({ fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ fillDate: new Date(2026, 0, 31), daysSupply: 30 }),
      fill({ fillDate: new Date(2026, 1, 28), daysSupply: 30 }),
    ];
    const report = computePdc(fills, {
      measurementStart: PERIOD_START,
      measurementEnd: new Date(2026, 2, 31), // Mar 31, 90 days
      adherentThreshold: 0.5,
    });
    expect(report.perMedication[0]?.adherent).toBe(true);
  });
});

describe('computePdc — multi-medication', () => {
  it('separates per-medication and produces a regimen mean', () => {
    const fills: FillEvent[] = [
      // m-a: fully covered, PDC=1
      ...Array.from({ length: 4 }, (_, i) =>
        fill({ medicationId: 'm-a', fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }),
      ),
      // m-b: half covered
      fill({ medicationId: 'm-b', fillDate: new Date(2026, 0, 1), daysSupply: 60 }),
    ];
    const report = computePdc(fills, {
      measurementStart: new Date(2026, 0, 1),
      measurementEnd: new Date(2026, 3, 30), // 120 days
    });
    expect(report.perMedication).toHaveLength(2);
    const a = report.perMedication.find((m) => m.medicationId === 'm-a')!;
    const b = report.perMedication.find((m) => m.medicationId === 'm-b')!;
    expect(a.pdc).toBe(1);
    expect(b.pdc).toBeCloseTo(60 / 120, 3);
    expect(report.meanPdc).toBeCloseTo(0.75, 3);
    expect(report.adherentCount).toBe(1);
    expect(report.totalCount).toBe(2);
  });

  it('rolls up to class-level PDC when medicationClasses provided', () => {
    const fills: FillEvent[] = [
      fill({ medicationId: 'm-metformin', fillDate: new Date(2026, 0, 1), daysSupply: 90 }),
      fill({ medicationId: 'm-metformin', fillDate: new Date(2026, 2, 31), daysSupply: 90 }),
      fill({ medicationId: 'm-sglt2', fillDate: new Date(2026, 0, 1), daysSupply: 90 }),
    ];
    const report = computePdc(fills, {
      measurementStart: new Date(2026, 0, 1),
      measurementEnd: new Date(2026, 5, 29), // 180 days
      medicationClasses: [
        { medicationId: 'm-metformin', classCode: 'diabetes' },
        { medicationId: 'm-sglt2', classCode: 'diabetes' },
      ],
    });
    expect(report.perClass).toHaveLength(1);
    expect(report.perClass[0]?.classCode).toBe('diabetes');
    expect(report.perClass[0]?.medicationIds).toEqual(['m-metformin', 'm-sglt2']);
    // metformin: 180/180=1.0, sglt2: 90/180=0.5, mean=0.75
    expect(report.perClass[0]?.meanPdc).toBeCloseTo(0.75, 3);
  });
});

describe('computePdc — edge cases', () => {
  it('excludes a medication whose fills are entirely before the period', () => {
    const fills: FillEvent[] = [
      fill({ medicationId: 'm-old', fillDate: new Date(2025, 0, 1), daysSupply: 30 }),
    ];
    const report = computePdc(fills, {
      measurementStart: new Date(2026, 0, 1),
      measurementEnd: new Date(2026, 11, 31),
    });
    expect(report.perMedication).toHaveLength(0);
    expect(report.totalCount).toBe(0);
  });

  it('returns an empty report when no fills at all', () => {
    const report = computePdc([], {
      measurementStart: new Date(2026, 0, 1),
      measurementEnd: new Date(2026, 11, 31),
    });
    expect(report.perMedication).toHaveLength(0);
    expect(report.meanPdc).toBe(0);
    expect(summarizePdc(report)).toBe('No fills in the measurement period.');
  });

  it('uses default measurement window (365 days back from latest fill end)', () => {
    const fills: FillEvent[] = [
      fill({ fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
    ];
    const report = computePdc(fills);
    expect(report.measurementEnd).toBe('2026-01-30');
    // 365 days back from 2026-01-30 = 2025-01-31.
    expect(report.measurementStart).toBe('2025-01-31');
  });

  it('flags a medication with only a pre-period fill as noFill when listed in classes', () => {
    const fills: FillEvent[] = [
      fill({ medicationId: 'm-pre', fillDate: new Date(2025, 0, 1), daysSupply: 30 }),
    ];
    const report = computePdc(fills, {
      measurementStart: new Date(2026, 0, 1),
      measurementEnd: new Date(2026, 11, 31),
      medicationClasses: [{ medicationId: 'm-pre', classCode: 'cardio' }],
    });
    expect(report.noFillCount).toBe(1);
    expect(report.perMedication).toHaveLength(1);
    expect(report.perMedication[0]?.pdc).toBe(0);
  });
});

describe('summarizePdc', () => {
  it('produces a single-line headline', () => {
    const fills: FillEvent[] = [
      ...Array.from({ length: 13 }, (_, i) =>
        fill({ medicationId: 'm-a', fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }),
      ),
      fill({ medicationId: 'm-b', fillDate: new Date(2026, 0, 1), daysSupply: 60 }),
    ];
    const report = computePdc(fills, {
      measurementStart: new Date(2026, 0, 1),
      measurementEnd: new Date(2026, 11, 31),
    });
    const summary = summarizePdc(report);
    expect(summary).toContain('1 of 2 medications');
    expect(summary).toContain('mean');
  });
});
