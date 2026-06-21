import { describe, it, expect } from 'vitest';
import {
  buildLabWindowReport,
  overdueLabWindows,
  dueSoonLabWindows,
  type MedicationMonitoringSpec,
  type LabResult,
} from '../src/lab-window-tracker';

const NOW = new Date(2026, 5, 20); // Jun 20 2026

const WARFARIN: MedicationMonitoringSpec = {
  medicationId: 'm-warfarin',
  medicationName: 'Warfarin',
  startedAt: new Date(2025, 11, 1).toISOString(),
  requirements: [
    { labCode: 'INR', labName: 'INR', cadenceDays: 28, warnWithinDays: 7 },
  ],
};

const STATIN_BASELINE: MedicationMonitoringSpec = {
  medicationId: 'm-statin',
  medicationName: 'Atorvastatin',
  startedAt: new Date(2026, 5, 1).toISOString(), // started 19 days before NOW
  requirements: [
    {
      labCode: 'LFT',
      labName: 'Liver function panel',
      cadenceDays: 84, // 12 weeks
      warnWithinDays: 14,
      requireBaseline: true,
      baselineDueDays: 14,
    },
  ],
};

const LITHIUM: MedicationMonitoringSpec = {
  medicationId: 'm-lithium',
  medicationName: 'Lithium',
  startedAt: new Date(2025, 0, 1).toISOString(),
  requirements: [
    { labCode: 'LITHIUM', labName: 'Lithium level', cadenceDays: 90, warnWithinDays: 14 },
    { labCode: 'TSH', labName: 'Thyroid function', cadenceDays: 180, warnWithinDays: 21 },
    { labCode: 'CMP', labName: 'Renal panel', cadenceDays: 180, warnWithinDays: 21 },
  ],
};

describe('buildLabWindowReport', () => {
  it('marks INR overdue when the last draw was more than cadenceDays ago', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 4, 1) }, // ~50 days ago
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('overdue');
    expect(w.daysUntilDue).toBeLessThan(0);
    expect(w.message).toMatch(/overdue/);
    expect(report.totals.overdue).toBe(1);
  });

  it('marks INR due-soon when next draw lands within warnWithinDays', () => {
    // last draw 25 days ago, cadence 28 -> 3 days until due
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 4, 26) },
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('due-soon');
    expect(w.daysUntilDue).toBe(3);
    expect(report.totals['due-soon']).toBe(1);
  });

  it('marks INR on-track when the next draw is well in the future', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 5, 18) }, // 2 days ago
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('on-track');
    expect(w.daysUntilDue).toBe(26);
  });

  it('flags no-history when no result is on file and baseline is not required', () => {
    const report = buildLabWindowReport({
      medications: [WARFARIN],
      results: [],
      now: NOW,
    });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('no-history');
    expect(w.lastDrawnAt).toBeNull();
    expect(w.nextDueAt).toBeNull();
  });

  it('flags baseline overdue when requireBaseline and grace expired', () => {
    // statin started Jun 1, baselineDueDays=14 -> due Jun 15, NOW=Jun 20 -> 5 days overdue.
    const report = buildLabWindowReport({
      medications: [STATIN_BASELINE],
      results: [],
      now: NOW,
    });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('overdue');
    expect(w.daysUntilDue).toBe(-5);
    expect(w.message).toMatch(/baseline/);
  });

  it('flags baseline due-soon within warnWithinDays', () => {
    // statin started Jun 13, baseline due Jun 27 -> 7 days from NOW.
    const spec: MedicationMonitoringSpec = {
      ...STATIN_BASELINE,
      startedAt: new Date(2026, 5, 13).toISOString(),
    };
    const report = buildLabWindowReport({ medications: [spec], results: [], now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('due-soon');
    expect(w.daysUntilDue).toBe(7);
  });

  it('flags baseline not-due-yet when started recently', () => {
    // statin started Jun 18, baseline due Jul 2 -> 12 days, warn=14 -> still due-soon.
    // Use baselineDueDays=30 so it's not-due-yet (30 days > 14 warn).
    const spec: MedicationMonitoringSpec = {
      ...STATIN_BASELINE,
      startedAt: new Date(2026, 5, 18).toISOString(),
      requirements: [
        {
          ...STATIN_BASELINE.requirements[0]!,
          baselineDueDays: 30,
        },
      ],
    };
    const report = buildLabWindowReport({ medications: [spec], results: [], now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('not-due-yet');
    expect(w.daysUntilDue).toBeGreaterThan(14);
  });

  it('counts multiple lab requirements per medication independently', () => {
    const results: LabResult[] = [
      { medicationId: 'm-lithium', labCode: 'LITHIUM', drawnAt: new Date(2026, 0, 1) }, // ancient -> overdue
      { medicationId: 'm-lithium', labCode: 'TSH', drawnAt: new Date(2026, 4, 1) }, // recent
      { medicationId: 'm-lithium', labCode: 'CMP', drawnAt: new Date(2026, 5, 18) }, // very recent
    ];
    const report = buildLabWindowReport({ medications: [LITHIUM], results, now: NOW });
    const windowsByCode = Object.fromEntries(
      report.perMedication[0]!.windows.map((w) => [w.labCode, w]),
    );
    expect(windowsByCode.LITHIUM!.status).toBe('overdue');
    expect(windowsByCode.TSH!.status).toBe('on-track');
    expect(windowsByCode.CMP!.status).toBe('on-track');
  });

  it('rolls up the medication to the worst status across labs', () => {
    const results: LabResult[] = [
      { medicationId: 'm-lithium', labCode: 'LITHIUM', drawnAt: new Date(2026, 0, 1) },
      { medicationId: 'm-lithium', labCode: 'TSH', drawnAt: new Date(2026, 4, 1) },
      { medicationId: 'm-lithium', labCode: 'CMP', drawnAt: new Date(2026, 5, 18) },
    ];
    const report = buildLabWindowReport({ medications: [LITHIUM], results, now: NOW });
    const rollup = report.perMedication[0]!;
    expect(rollup.worstStatus).toBe('overdue');
    expect(rollup.headline).toMatch(/Lithium/);
    expect(rollup.headline).toMatch(/Lithium level/);
    expect(rollup.headline).toMatch(/overdue/);
  });

  it('rolls up to due-soon when nothing is overdue', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 4, 26) }, // due in 3
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const rollup = report.perMedication[0]!;
    expect(rollup.worstStatus).toBe('due-soon');
    expect(rollup.headline).toMatch(/due in/);
  });

  it('reports flat list sorted by daysUntilDue ascending (most overdue first)', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 5, 18) }, // due in 26
      { medicationId: 'm-lithium', labCode: 'LITHIUM', drawnAt: new Date(2026, 0, 1) }, // overdue ~80
      { medicationId: 'm-lithium', labCode: 'TSH', drawnAt: new Date(2026, 4, 1) }, // due in ~130
      { medicationId: 'm-lithium', labCode: 'CMP', drawnAt: new Date(2026, 5, 18) }, // due in ~178
    ];
    const report = buildLabWindowReport({
      medications: [WARFARIN, LITHIUM],
      results,
      now: NOW,
    });
    for (let i = 1; i < report.flat.length; i++) {
      expect(report.flat[i]!.daysUntilDue).toBeGreaterThanOrEqual(report.flat[i - 1]!.daysUntilDue);
    }
    expect(report.flat[0]!.labCode).toBe('LITHIUM');
  });

  it('totals across the regimen', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 5, 18) },
      { medicationId: 'm-lithium', labCode: 'LITHIUM', drawnAt: new Date(2026, 0, 1) },
    ];
    const report = buildLabWindowReport({
      medications: [WARFARIN, LITHIUM],
      results,
      now: NOW,
    });
    const sum = Object.values(report.totals).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.flat.length);
    expect(report.totals.overdue).toBeGreaterThanOrEqual(1);
  });

  it('uses the most recent result when multiple draws exist for the same lab', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 0, 1) }, // ancient
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 5, 18) }, // 2 days ago
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('on-track');
    expect(w.lastDrawnAt).toBe('2026-06-18');
  });

  it('ignores results for a different medication or different lab code', () => {
    const results: LabResult[] = [
      { medicationId: 'm-other', labCode: 'INR', drawnAt: new Date(2026, 5, 18) },
      { medicationId: 'm-warfarin', labCode: 'A1C', drawnAt: new Date(2026, 5, 18) },
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.status).toBe('no-history');
  });

  it('emits a sensible rollup when a medication has no requirements', () => {
    const empty: MedicationMonitoringSpec = {
      medicationId: 'm-empty',
      medicationName: 'Vitamin D',
      startedAt: new Date(2026, 0, 1).toISOString(),
      requirements: [],
    };
    const report = buildLabWindowReport({ medications: [empty], results: [], now: NOW });
    const rollup = report.perMedication[0]!;
    expect(rollup.windows).toHaveLength(0);
    expect(rollup.worstStatus).toBe('on-track');
    expect(rollup.headline).toMatch(/no monitoring required/);
  });

  it('1-day messages use singular nouns', () => {
    // Set up an INR overdue by exactly 1 day.
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 4, 22) }, // 29 days ago -> overdue by 1
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const w = report.perMedication[0]!.windows[0]!;
    expect(w.daysUntilDue).toBe(-1);
    expect(w.message).toMatch(/by 1 day\b/);
  });
});

describe('overdueLabWindows / dueSoonLabWindows', () => {
  it('overdueLabWindows returns only overdue rows', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 4, 1) }, // overdue
      { medicationId: 'm-lithium', labCode: 'LITHIUM', drawnAt: new Date(2026, 5, 1) }, // on-track-ish
    ];
    const report = buildLabWindowReport({
      medications: [WARFARIN, LITHIUM],
      results,
      now: NOW,
    });
    const od = overdueLabWindows(report);
    expect(od.every((w) => w.status === 'overdue')).toBe(true);
    expect(od.map((w) => w.labCode)).toContain('INR');
  });

  it('dueSoonLabWindows returns only due-soon rows', () => {
    const results: LabResult[] = [
      { medicationId: 'm-warfarin', labCode: 'INR', drawnAt: new Date(2026, 4, 26) }, // due in 3
    ];
    const report = buildLabWindowReport({ medications: [WARFARIN], results, now: NOW });
    const ds = dueSoonLabWindows(report);
    expect(ds.every((w) => w.status === 'due-soon')).toBe(true);
    expect(ds).toHaveLength(1);
  });
});
