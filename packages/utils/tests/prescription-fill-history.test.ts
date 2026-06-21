import { describe, it, expect } from 'vitest';
import {
  normalizeFillHistory,
  isCoveredOn,
  activeGap,
  summarizeFillHistory,
  type PharmacyFillEvent,
} from '../src/prescription-fill-history';

function fill(o: Partial<PharmacyFillEvent>): PharmacyFillEvent {
  return {
    medicationId: o.medicationId ?? 'm1',
    ndc: o.ndc,
    fillDate: o.fillDate ?? new Date(2026, 0, 1),
    daysSupply: o.daysSupply ?? 30,
  };
}

describe('normalizeFillHistory — basic coverage', () => {
  it('single 30-day fill covers exactly 30 days', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
    ]);
    const m = report.perMedication[0]!;
    expect(m.daysCovered).toBe(30);
    expect(m.windowDays).toBe(30);
    expect(m.coverageRatio).toBe(1);
    expect(m.gaps).toHaveLength(0);
  });

  it('contiguous 30-day fills with no gap produce no gaps', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 31), daysSupply: 30 }),
    ]);
    const m = report.perMedication[0]!;
    expect(m.daysCovered).toBe(60);
    expect(m.gaps).toHaveLength(0);
  });

  it('detects a multi-day gap between fills', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }), // covers Jan 1-30
      fill({ medicationId: 'm1', fillDate: new Date(2026, 1, 9), daysSupply: 30 }), // covers Feb 9 - Mar 10
    ]);
    const m = report.perMedication[0]!;
    expect(m.gaps).toHaveLength(1);
    expect(m.gaps[0]?.start).toBe('2026-01-31');
    expect(m.gaps[0]?.end).toBe('2026-02-08');
    expect(m.gaps[0]?.days).toBe(9);
  });

  it('overlapping fills extend the tail without double-counting', () => {
    // Jan 1 fill (30d), Jan 20 fill (30d): coverage should run Jan 1 - Feb 18 (49 days, NOT 60).
    const report = normalizeFillHistory([
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 20), daysSupply: 30 }),
    ]);
    const m = report.perMedication[0]!;
    // Window auto-spans Jan 1 through end-of-extended-tail = Jan 1 + 60 days - 1 = Mar 1 (60 days inclusive).
    // BUT the "extend, don't reset" rule sets tail = (Jan 20 - 1) + 30 days... actually
    // it's: first fill tail = Jan 30; Jan 20 <= Jan 30+1 so extend by 30d -> tail = Jan 30 + 30 = Mar 1.
    // So coverage: Jan 1 through Mar 1 = 60 days.
    expect(m.daysCovered).toBe(60);
    expect(m.gaps).toHaveLength(0);
  });

  it('window option clips coverage to its bounds', () => {
    const report = normalizeFillHistory(
      [fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 })],
      { windowStart: new Date(2026, 0, 5), windowEnd: new Date(2026, 0, 20) },
    );
    const m = report.perMedication[0]!;
    expect(m.windowDays).toBe(16);
    expect(m.daysCovered).toBe(16);
    expect(m.coverageRatio).toBe(1);
  });

  it('reports gap at start of window before first fill', () => {
    const report = normalizeFillHistory(
      [fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 15), daysSupply: 30 })],
      { windowStart: new Date(2026, 0, 1), windowEnd: new Date(2026, 1, 13) },
    );
    const m = report.perMedication[0]!;
    expect(m.gaps[0]?.start).toBe('2026-01-01');
    expect(m.gaps[0]?.end).toBe('2026-01-14');
    expect(m.gaps[0]?.days).toBe(14);
  });

  it('reports gap at end of window after coverage ends', () => {
    const report = normalizeFillHistory(
      [fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 })],
      { windowStart: new Date(2026, 0, 1), windowEnd: new Date(2026, 1, 13) },
    );
    const m = report.perMedication[0]!;
    expect(m.gaps[0]?.start).toBe('2026-01-31');
    expect(m.gaps[0]?.end).toBe('2026-02-13');
    expect(m.gaps[0]?.days).toBe(14);
  });

  it('minGapDays filters out short gaps', () => {
    const report = normalizeFillHistory(
      [
        fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
        fill({ medicationId: 'm1', fillDate: new Date(2026, 1, 2), daysSupply: 30 }), // 2-day gap
      ],
      { minGapDays: 5 },
    );
    const m = report.perMedication[0]!;
    expect(m.gaps).toHaveLength(0);
  });
});

describe('normalizeFillHistory — multi-medication', () => {
  it('separates per-medication coverage', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm-a', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm-b', fillDate: new Date(2026, 0, 15), daysSupply: 30 }),
    ]);
    expect(report.perMedication).toHaveLength(2);
    expect(report.perMedication.map((p) => p.medicationId)).toEqual(['m-a', 'm-b']);
  });

  it('rolls up NDC variants for the same medicationId', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm1', ndc: '11111-111-11', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm1', ndc: '22222-222-22', fillDate: new Date(2026, 0, 31), daysSupply: 30 }),
    ]);
    const m = report.perMedication[0]!;
    expect(m.ndcs).toEqual(['11111-111-11', '22222-222-22']);
    expect(m.fillCount).toBe(2);
  });

  it('totalGapDays sums across the regimen', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm-a', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm-a', fillDate: new Date(2026, 1, 9), daysSupply: 30 }), // 9-day gap
      fill({ medicationId: 'm-b', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm-b', fillDate: new Date(2026, 1, 15), daysSupply: 30 }), // 15-day gap
    ]);
    expect(report.totalGapDays).toBe(24);
  });
});

describe('normalizeFillHistory — validation', () => {
  it('rejects fills with missing medicationId', () => {
    const out = normalizeFillHistory([
      { medicationId: '', fillDate: new Date(2026, 0, 1), daysSupply: 30 },
    ]);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]?.reason).toBe('missing-medicationId');
  });

  it('rejects zero or negative daysSupply', () => {
    const out = normalizeFillHistory([
      fill({ daysSupply: 0 }),
      fill({ daysSupply: -5 }),
    ]);
    expect(out.rejected).toHaveLength(2);
    expect(out.rejected.every((r) => r.reason === 'invalid-daysSupply')).toBe(true);
  });

  it('rejects malformed fillDate', () => {
    const out = normalizeFillHistory([fill({ fillDate: 'not-a-date' })]);
    expect(out.rejected).toHaveLength(1);
    expect(out.rejected[0]?.reason).toBe('invalid-fillDate');
  });

  it('returns empty report when no valid fills', () => {
    const out = normalizeFillHistory([]);
    expect(out.perMedication).toHaveLength(0);
    expect(out.totalGapDays).toBe(0);
  });
});

describe('isCoveredOn', () => {
  const report = normalizeFillHistory(
    [
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'm1', fillDate: new Date(2026, 1, 9), daysSupply: 30 }),
    ],
  );
  const coverage = report.perMedication[0]!;

  it('returns true inside a covered run', () => {
    expect(isCoveredOn(coverage, new Date(2026, 0, 15))).toBe(true);
  });
  it('returns false inside the gap', () => {
    expect(isCoveredOn(coverage, new Date(2026, 1, 5))).toBe(false);
  });
  it('returns false outside the window', () => {
    expect(isCoveredOn(coverage, new Date(2025, 11, 31))).toBe(false);
  });
});

describe('activeGap', () => {
  const report = normalizeFillHistory([
    fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
    fill({ medicationId: 'm1', fillDate: new Date(2026, 1, 15), daysSupply: 30 }),
  ]);
  const coverage = report.perMedication[0]!;

  it('returns the gap when patient is currently in one', () => {
    const g = activeGap(coverage, new Date(2026, 1, 5));
    expect(g?.start).toBe('2026-01-31');
    expect(g?.end).toBe('2026-02-14');
  });
  it('returns undefined when patient is covered', () => {
    expect(activeGap(coverage, new Date(2026, 0, 10))).toBeUndefined();
  });
});

describe('summarizeFillHistory', () => {
  it('reports the worst gap in the summary', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'metformin', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
      fill({ medicationId: 'metformin', fillDate: new Date(2026, 1, 9), daysSupply: 30 }),
      fill({ medicationId: 'lisinopril', fillDate: new Date(2026, 0, 1), daysSupply: 60 }),
    ]);
    const summary = summarizeFillHistory(report);
    expect(summary).toContain('1 of 2 medications fully covered');
    expect(summary).toContain('metformin has a 9-day gap');
  });
  it('reports clean state when all covered', () => {
    const report = normalizeFillHistory([
      fill({ medicationId: 'm1', fillDate: new Date(2026, 0, 1), daysSupply: 30 }),
    ]);
    expect(summarizeFillHistory(report)).toBe('Refill coverage: 1 of 1 medication fully covered.');
  });
  it('handles empty history', () => {
    expect(summarizeFillHistory(normalizeFillHistory([]))).toBe('No fill history available.');
  });
});
