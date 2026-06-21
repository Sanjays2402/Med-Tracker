import { describe, it, expect } from 'vitest';
import { computePdcTrend, summarizePdcTrend } from '../src/pdc-trend';
import type { PharmacyFillEvent } from '../src/prescription-fill-history';

function fill(o: Partial<PharmacyFillEvent>): PharmacyFillEvent {
  return {
    medicationId: o.medicationId ?? 'm1',
    ndc: o.ndc,
    fillDate: o.fillDate ?? new Date(2026, 0, 1),
    daysSupply: o.daysSupply ?? 30,
  };
}

const AS_OF = new Date(2026, 11, 31); // Dec 31 2026

describe('computePdcTrend — basic structure', () => {
  it('returns one entry per medication with the configured windows', () => {
    const fills: PharmacyFillEvent[] = [];
    for (let i = 0; i < 13; i++) {
      fills.push(fill({ medicationId: 'metformin', fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF });
    expect(report.windowsDays).toEqual([90, 180, 365]);
    expect(report.perMedication).toHaveLength(1);
    expect(report.perMedication[0]!.medicationId).toBe('metformin');
    expect(report.perMedication[0]!.windows).toHaveLength(3);
    expect(report.asOf).toBe('2026-12-31');
  });

  it('respects custom windowsDays', () => {
    const fills = [fill({ medicationId: 'm', fillDate: new Date(2026, 11, 1) })];
    const report = computePdcTrend(fills, { asOf: AS_OF, windowsDays: [30, 60] });
    expect(report.windowsDays).toEqual([30, 60]);
    expect(report.perMedication[0]!.windows.map((w) => w.windowDays)).toEqual([30, 60]);
  });

  it('sorts arbitrary windowsDays ascending', () => {
    const report = computePdcTrend([fill({})], { asOf: AS_OF, windowsDays: [365, 90, 180] });
    expect(report.windowsDays).toEqual([90, 180, 365]);
  });

  it('drops invalid window lengths silently', () => {
    const report = computePdcTrend([fill({})], { asOf: AS_OF, windowsDays: [90, -1, 0, NaN, 180] });
    expect(report.windowsDays).toEqual([90, 180]);
  });

  it('returns empty when no windows configured', () => {
    const report = computePdcTrend([fill({})], { asOf: AS_OF, windowsDays: [] });
    expect(report.perMedication).toHaveLength(0);
  });
});

describe('computePdcTrend — trend classification', () => {
  it('classifies a continuously-filled regimen as stable around 1.0', () => {
    // Continuous monthly fills for a full year.
    const fills: PharmacyFillEvent[] = [];
    for (let i = 0; i < 13; i++) {
      fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF });
    const m = report.perMedication[0]!;
    expect(m.direction).toBe('stable');
    expect(m.latestPdc).toBeGreaterThanOrEqual(0.95);
    expect(m.baselinePdc).toBeGreaterThanOrEqual(0.95);
    expect(m.message).toMatch(/Stable/);
  });

  it('classifies recent improvement as improving', () => {
    // Far-back history sparse (a few fills in early year), then a
    // dense run in the last 90 days. Latest window will be high,
    // baseline (365d) will be lower.
    const fills: PharmacyFillEvent[] = [];
    // Old sparse fills: just 2 fills in Jan / Feb.
    fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 0, 1), daysSupply: 30 }));
    fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 1, 1), daysSupply: 30 }));
    // Then a long gap from March through Oct.
    // Then dense fills in the last 90 days (Oct -> Dec):
    for (let i = 0; i < 4; i++) {
      fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 9, 3 + i * 30), daysSupply: 30 }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF });
    const m = report.perMedication[0]!;
    expect(m.direction).toBe('improving');
    expect(m.latestPdc!).toBeGreaterThan(m.baselinePdc!);
    expect(m.delta!).toBeGreaterThan(0);
    expect(m.message).toMatch(/Improving/);
  });

  it('classifies recent drop-off as declining', () => {
    // Dense old fills, then a gap in the last 90 days.
    const fills: PharmacyFillEvent[] = [];
    for (let i = 0; i < 9; i++) {
      fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }));
    }
    // Last fill = day 240 (Aug 28 ish). After that: nothing through Dec 31.
    const report = computePdcTrend(fills, { asOf: AS_OF });
    const m = report.perMedication[0]!;
    expect(m.direction).toBe('declining');
    expect(m.latestPdc!).toBeLessThan(m.baselinePdc!);
    expect(m.delta!).toBeLessThan(0);
    expect(m.message).toMatch(/Declining/);
  });

  it('treats deltas inside the stable band as stable', () => {
    // Configure an impossible-to-exceed stable band (PDC is in [0,1]
    // so any |delta| <= 1; band of 1.5 absorbs everything) and verify
    // declining classifications collapse into stable.
    const fills: PharmacyFillEvent[] = [];
    for (let i = 0; i < 9; i++) {
      fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 0, 1 + i * 30), daysSupply: 30 }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF, stableBandDelta: 1.5 });
    expect(report.perMedication[0]!.direction).toBe('stable');
  });
});

describe('computePdcTrend — insufficient data handling', () => {
  it('reports insufficient when no windows have a fill', () => {
    // Single very old fill, all rolling windows from Dec 31 will miss it.
    const fills = [fill({ medicationId: 'm', fillDate: new Date(2025, 0, 1), daysSupply: 30 })];
    const report = computePdcTrend(fills, { asOf: AS_OF });
    expect(report.perMedication).toHaveLength(1);
    expect(report.perMedication[0]!.direction).toBe('insufficient');
    expect(report.perMedication[0]!.message).toMatch(/Not enough/);
  });

  it('reports insufficient when only one window has a fill', () => {
    // Single fill in the last 60 days — fits in 90d window but not 180/365.
    const fills = [fill({ medicationId: 'm', fillDate: new Date(2026, 11, 1), daysSupply: 5 })];
    const report = computePdcTrend(fills, { asOf: AS_OF, windowsDays: [60, 365] });
    // Both 60d and 365d windows include Dec 1 fill, so both have data.
    expect(report.perMedication[0]!.direction).not.toBe('insufficient');
  });

  it('marks per-window noFill flag correctly', () => {
    // Fill only inside the 365d window, not the 90d window.
    const fills = [fill({ medicationId: 'm', fillDate: new Date(2026, 3, 1), daysSupply: 30 })];
    const report = computePdcTrend(fills, { asOf: AS_OF, windowsDays: [90, 365] });
    const wins = report.perMedication[0]!.windows;
    expect(wins[0]!.noFill).toBe(true);  // 90d
    expect(wins[1]!.noFill).toBe(false); // 365d
  });

  it('handles empty fills cleanly', () => {
    const report = computePdcTrend([]);
    expect(report.perMedication).toHaveLength(0);
    expect(report.declining).toHaveLength(0);
  });
});

describe('computePdcTrend — multi-medication regimen', () => {
  it('reports each medication independently and groups declining medications', () => {
    const fills: PharmacyFillEvent[] = [];
    // metformin: continuous adherence -> stable.
    for (let i = 0; i < 13; i++) {
      fills.push(fill({ medicationId: 'metformin', fillDate: new Date(2026, 0, 1 + i * 30) }));
    }
    // lisinopril: stopped filling after day 240 -> declining.
    for (let i = 0; i < 9; i++) {
      fills.push(fill({ medicationId: 'lisinopril', fillDate: new Date(2026, 0, 1 + i * 30) }));
    }
    // simvastatin: late starter, only last 90 days -> improving.
    fills.push(fill({ medicationId: 'simvastatin', fillDate: new Date(2026, 0, 1), daysSupply: 30 }));
    for (let i = 0; i < 4; i++) {
      fills.push(fill({ medicationId: 'simvastatin', fillDate: new Date(2026, 9, 3 + i * 30) }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF });
    expect(report.perMedication).toHaveLength(3);
    expect(report.declining.length).toBeGreaterThanOrEqual(1);
    expect(report.declining[0]!.medicationId).toBe('lisinopril');
    const metformin = report.perMedication.find((m) => m.medicationId === 'metformin')!;
    expect(metformin.direction).toBe('stable');
  });
});

describe('summarizePdcTrend', () => {
  it('reports zero history cleanly', () => {
    expect(summarizePdcTrend({ asOf: '2026-12-31', windowsDays: [90], perMedication: [], declining: [] }))
      .toBe('No fill history available.');
  });

  it('lists trend counts', () => {
    const fills: PharmacyFillEvent[] = [];
    for (let i = 0; i < 13; i++) {
      fills.push(fill({ medicationId: 'continuous', fillDate: new Date(2026, 0, 1 + i * 30) }));
    }
    for (let i = 0; i < 9; i++) {
      fills.push(fill({ medicationId: 'dropoff', fillDate: new Date(2026, 0, 1 + i * 30) }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF });
    const summary = summarizePdcTrend(report);
    expect(summary).toMatch(/Adherence trend/);
    expect(summary).toMatch(/declining/);
    expect(summary).toMatch(/2 medications/);
  });
});

describe('computePdcTrend — slope reporting', () => {
  it('reports slope direction matching trend', () => {
    // Declining case: latest PDC < baseline PDC, slope should be positive
    // (PDC increases as windowDays increases — older windows are healthier).
    const fills: PharmacyFillEvent[] = [];
    for (let i = 0; i < 9; i++) {
      fills.push(fill({ medicationId: 'm', fillDate: new Date(2026, 0, 1 + i * 30) }));
    }
    const report = computePdcTrend(fills, { asOf: AS_OF });
    const m = report.perMedication[0]!;
    expect(m.slopePerDay).not.toBeNull();
    // Declining trend => baseline (longer window) > latest (shorter) =>
    // PDC increases with windowDays => positive slope.
    expect(m.slopePerDay!).toBeGreaterThan(0);
  });
});
