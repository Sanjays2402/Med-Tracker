import { describe, it, expect } from 'vitest';
import {
  scoreRegimenLoad,
  type RegimenLoadInput,
} from '../src/regimen-load-score';
import type { PillBurdenSummary } from '../src/pill-burden';
import type { LabWindowReport, LabStatus, LabWindow } from '../src/lab-window-tracker';
import type { RegimenCostProjection } from '../src/refill-cost-projector';

function pill(overrides: Partial<PillBurdenSummary> = {}): PillBurdenSummary {
  return {
    pillCount: 0,
    liquidMl: 0,
    injectionCount: 0,
    totalMg: 0,
    byTime: { morning: 0, midday: 0, evening: 0, bedtime: 0 },
    byMedication: [],
    medicationCount: 0,
    administrationsPerDay: 0,
    message: '',
    ...overrides,
  };
}

function window(status: LabStatus, daysUntilDue = 0): LabWindow {
  return {
    medicationId: 'm-x',
    medicationName: 'Mx',
    labCode: 'L',
    labName: 'Lab',
    status,
    daysUntilDue,
    lastDrawnAt: null,
    nextDueAt: null,
    message: status,
  };
}

function labReport(windows: LabWindow[]): LabWindowReport {
  const totals: Record<LabStatus, number> = {
    overdue: 0, 'due-soon': 0, 'no-history': 0, 'on-track': 0, 'not-due-yet': 0,
  };
  for (const w of windows) totals[w.status] += 1;
  return { perMedication: [], flat: windows.slice(), totals };
}

function costProj(totalCents: number): RegimenCostProjection {
  return {
    windowStart: '2026-01-01',
    windowEnd: '2026-12-31',
    perMedication: [],
    totalCents,
    totalCentsWithoutPlanChange: totalCents,
    planChangeSavingsCents: 0,
  };
}

describe('scoreRegimenLoad', () => {
  it('returns total 0 for an empty regimen', () => {
    const r = scoreRegimenLoad({ pillBurden: pill() });
    expect(r.total).toBe(0);
    expect(r.band).toBe('light');
    expect(r.components.dosing.score).toBe(0);
    expect(r.components.pills.score).toBe(0);
    expect(r.components.monitoring.score).toBe(0);
    expect(r.components.cost.score).toBe(0);
    expect(r.components.prn.score).toBe(0);
  });

  it('dosing component blends doses-per-day with med count', () => {
    // 9 admins/day (half of 18 ceiling) + 6 meds (half of 12 ceiling) -> both 0.5 -> 50.
    const r = scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: 9, medicationCount: 6 }),
    });
    expect(r.components.dosing.score).toBeCloseTo(50, 5);
  });

  it('dosing component caps at 100 above the ceilings', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: 36, medicationCount: 30 }),
    });
    expect(r.components.dosing.score).toBe(100);
  });

  it('pills component scales with pillCount + injectionCount', () => {
    // 10 pills + 0 injections; ceiling 20 -> 50.
    const r = scoreRegimenLoad({
      pillBurden: pill({ pillCount: 10 }),
    });
    expect(r.components.pills.score).toBeCloseTo(50, 5);
  });

  it('pills component caps at 100', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill({ pillCount: 40, injectionCount: 5 }),
    });
    expect(r.components.pills.score).toBe(100);
  });

  it('monitoring component is 0 when no labReport', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill({ medicationCount: 1, administrationsPerDay: 1, pillCount: 1 }),
    });
    expect(r.components.monitoring.score).toBe(0);
    expect(r.components.monitoring.reason).toContain('No lab monitoring');
  });

  it('monitoring component grows with lab count', () => {
    // 4 labs all on-track, ceiling 8 -> baseline 0.5, overdue penalty 0 -> 0.5*0.7 = 0.35 -> 35.
    const r = scoreRegimenLoad({
      pillBurden: pill(),
      labReport: labReport([window('on-track'), window('on-track'), window('on-track'), window('on-track')]),
    });
    expect(r.components.monitoring.score).toBeCloseTo(35, 5);
  });

  it('monitoring component lifts the score when labs are overdue', () => {
    const onTrack = labReport(Array.from({ length: 4 }, () => window('on-track')));
    const overdue = labReport(Array.from({ length: 4 }, () => window('overdue', -5)));
    const r1 = scoreRegimenLoad({ pillBurden: pill(), labReport: onTrack });
    const r2 = scoreRegimenLoad({ pillBurden: pill(), labReport: overdue });
    expect(r2.components.monitoring.score).toBeGreaterThan(r1.components.monitoring.score);
  });

  it('cost component scales linearly to ceiling', () => {
    // 300k cents = $3000; ceiling 600k -> 50.
    const r = scoreRegimenLoad({
      pillBurden: pill(),
      costProjection: costProj(300_000),
    });
    expect(r.components.cost.score).toBeCloseTo(50, 5);
  });

  it('cost component caps at 100 above ceiling', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill(),
      costProjection: costProj(1_200_000),
    });
    expect(r.components.cost.score).toBe(100);
  });

  it('PRN component scales with prnMedicationCount', () => {
    // 2 PRNs / 5 ceiling -> 40.
    const r = scoreRegimenLoad({ pillBurden: pill(), prnMedicationCount: 2 });
    expect(r.components.prn.score).toBeCloseTo(40, 5);
  });

  it('weighted contributions sum equals total', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: 9, medicationCount: 6, pillCount: 10 }),
      labReport: labReport([window('overdue', -1), window('on-track')]),
      costProjection: costProj(200_000),
      prnMedicationCount: 1,
    });
    const sum =
      r.weightedContributions.dosing +
      r.weightedContributions.pills +
      r.weightedContributions.monitoring +
      r.weightedContributions.cost +
      r.weightedContributions.prn;
    expect(r.total).toBeCloseTo(sum, 5);
  });

  it('band classification is light/moderate/heavy/severe by 25/50/75', () => {
    expect(scoreRegimenLoad({ pillBurden: pill() }).band).toBe('light');
    expect(scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: 9, medicationCount: 6, pillCount: 10 }),
    }).band).toMatch(/moderate|heavy/);
    expect(scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: 18, medicationCount: 12, pillCount: 20, injectionCount: 0 }),
      labReport: labReport(Array.from({ length: 8 }, () => window('overdue', -1))),
      costProjection: costProj(600_000),
      prnMedicationCount: 5,
    }).band).toBe('severe');
  });

  it('respects custom weights and re-normalises if they do not sum to 1', () => {
    // All weight on dosing -> total == dosing score.
    const r = scoreRegimenLoad(
      {
        pillBurden: pill({ administrationsPerDay: 18, medicationCount: 12, pillCount: 20 }),
      },
      { weights: { dosing: 1, pills: 0, monitoring: 0, cost: 0, prn: 0 } },
    );
    expect(r.total).toBeCloseTo(r.components.dosing.score, 5);
    expect(r.total).toBe(100);
  });

  it('falls back to default weights when weights sum to zero', () => {
    const r = scoreRegimenLoad(
      { pillBurden: pill({ medicationCount: 6, administrationsPerDay: 9 }) },
      { weights: { dosing: 0, pills: 0, monitoring: 0, cost: 0, prn: 0 } },
    );
    expect(r.total).toBeGreaterThan(0);
  });

  it('allows tuning the cost ceiling', () => {
    const baseline = scoreRegimenLoad({ pillBurden: pill(), costProjection: costProj(100_000) });
    const tighter = scoreRegimenLoad(
      { pillBurden: pill(), costProjection: costProj(100_000) },
      { costCeilingCents: 100_000 },
    );
    expect(tighter.components.cost.score).toBe(100);
    expect(baseline.components.cost.score).toBeLessThan(100);
  });

  it('summary names the top two driver components', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: 18, medicationCount: 12, pillCount: 20 }),
    });
    expect(r.summary).toMatch(/Severe regimen|Heavy regimen/);
    expect(r.summary).toMatch(/dosing|pills/);
  });

  it('summary handles zero load without a driver list', () => {
    const r = scoreRegimenLoad({ pillBurden: pill() });
    expect(r.summary).toMatch(/Light regimen/);
  });

  it('treats non-finite or negative inputs as zero', () => {
    const r = scoreRegimenLoad({
      pillBurden: pill({ administrationsPerDay: NaN, medicationCount: -5, pillCount: -3 }),
    });
    expect(r.components.dosing.score).toBe(0);
    expect(r.components.pills.score).toBe(0);
    expect(r.total).toBe(0);
  });

  it('overdue lab penalty differs from due-soon and no-history', () => {
    const overdueR = scoreRegimenLoad({
      pillBurden: pill(),
      labReport: labReport([window('overdue', -5)]),
    });
    const dueSoonR = scoreRegimenLoad({
      pillBurden: pill(),
      labReport: labReport([window('due-soon', 3)]),
    });
    const noHistR = scoreRegimenLoad({
      pillBurden: pill(),
      labReport: labReport([window('no-history', 0)]),
    });
    expect(overdueR.components.monitoring.score).toBeGreaterThan(noHistR.components.monitoring.score);
    expect(noHistR.components.monitoring.score).toBeGreaterThan(dueSoonR.components.monitoring.score);
  });

  it('is deterministic across repeated calls with identical input', () => {
    const input: RegimenLoadInput = {
      pillBurden: pill({ administrationsPerDay: 6, medicationCount: 5, pillCount: 7 }),
      labReport: labReport([window('overdue', -2), window('on-track', 30)]),
      costProjection: costProj(150_000),
      prnMedicationCount: 2,
    };
    const a = scoreRegimenLoad(input);
    const b = scoreRegimenLoad(input);
    expect(a).toEqual(b);
  });
});
