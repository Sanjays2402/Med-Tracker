import { describe, it, expect } from 'vitest';
import {
  computeDoseTimeDrift,
  computeAllDoseTimeDrifts,
} from '../src/dose-time-drift';
import type { DoseHistoryEntry } from '../src/dose-history-aggregator';

function entry(
  medicationId: string,
  dueAt: Date,
  driftMinutes: number,
): DoseHistoryEntry {
  return {
    medicationId,
    dueAt: dueAt.toISOString(),
    takenAt: new Date(dueAt.getTime() + driftMinutes * 60_000).toISOString(),
  };
}

function makeDailyEntries(
  medicationId: string,
  drifts: number[],
  startDate = new Date(2026, 5, 1, 8, 0, 0),
): DoseHistoryEntry[] {
  return drifts.map((d, i) => {
    const due = new Date(startDate);
    due.setDate(due.getDate() + i);
    return entry(medicationId, due, d);
  });
}

describe('computeDoseTimeDrift', () => {
  it('returns insufficient when sample size is below threshold', () => {
    const e = makeDailyEntries('m-1', [10, 12, 8]);
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.direction).toBe('insufficient');
    expect(r.samples).toBe(3);
    expect(r.recommendedTimeShiftMinutes).toBe(0);
  });

  it('detects "aligned" when drift is within tolerance', () => {
    const drifts = [5, -3, 10, -8, 7, -5, 4, -2, 6, -7, 3, -4];
    const e = makeDailyEntries('m-1', drifts);
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.direction).toBe('aligned');
    expect(Math.abs(r.driftMinutes)).toBeLessThan(30);
    expect(r.recommendedTimeShiftMinutes).toBe(0);
  });

  it('detects "later" drift and recommends a positive shift', () => {
    const drifts = [55, 62, 48, 58, 65, 70, 52, 60, 57, 63, 59, 61];
    const e = makeDailyEntries('m-1', drifts);
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.direction).toBe('later');
    expect(r.driftMinutes).toBeGreaterThan(30);
    expect(r.recommendedTimeShiftMinutes).toBeGreaterThan(0);
    expect(r.recommendedTimeShiftMinutes % 5).toBe(0);
    expect(r.message).toMatch(/later/);
  });

  it('detects "earlier" drift and recommends a negative shift', () => {
    const drifts = [-50, -58, -45, -53, -60, -55, -48, -52, -57, -54, -50, -51];
    const e = makeDailyEntries('m-1', drifts);
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.direction).toBe('earlier');
    expect(r.driftMinutes).toBeLessThan(-30);
    expect(r.recommendedTimeShiftMinutes).toBeLessThan(0);
    expect(r.message).toMatch(/earlier/);
  });

  it('clips noise outliers without losing the sample', () => {
    // 10 close-to-zero drifts and 2 wild outliers; median should remain near 0.
    const drifts = [3, -2, 4, -3, 5, -4, 2, -1, 6, -2, 600, -600];
    const e = makeDailyEntries('m-1', drifts);
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.samples).toBe(12);
    expect(r.direction).toBe('aligned');
  });

  it('honors a custom alignedThresholdMinutes', () => {
    const drifts = [20, 22, 18, 24, 21, 19, 23, 20, 22, 21, 19, 23];
    const e = makeDailyEntries('m-1', drifts);
    const tight = computeDoseTimeDrift('m-1', e, { alignedThresholdMinutes: 15 });
    expect(tight.direction).toBe('later');
    const loose = computeDoseTimeDrift('m-1', e, { alignedThresholdMinutes: 60 });
    expect(loose.direction).toBe('aligned');
  });

  it('confidence rises with sample size and consistency', () => {
    const tight = makeDailyEntries('m-1', new Array(30).fill(60));
    const noisy = makeDailyEntries(
      'm-2',
      Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0 : 120)),
    );
    const rt = computeDoseTimeDrift('m-1', tight);
    const rn = computeDoseTimeDrift('m-2', noisy);
    expect(rt.confidence).toBeGreaterThan(rn.confidence);
    expect(rt.consistency).toBeGreaterThan(rn.consistency);
  });

  it('ignores entries marked skipped', () => {
    const drifts = new Array(12).fill(60);
    const e = makeDailyEntries('m-1', drifts);
    e.push({ medicationId: 'm-1', dueAt: e[0]!.dueAt, takenAt: null, skipped: true });
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.samples).toBe(12);
    expect(r.direction).toBe('later');
  });

  it('ignores entries with no takenAt', () => {
    const drifts = new Array(12).fill(60);
    const e = makeDailyEntries('m-1', drifts);
    e.push({ medicationId: 'm-1', dueAt: e[0]!.dueAt, takenAt: null });
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.samples).toBe(12);
  });

  it('ignores entries for other medications', () => {
    const drifts = new Array(12).fill(60);
    const e = makeDailyEntries('m-1', drifts);
    e.push(...makeDailyEntries('m-2', new Array(5).fill(-60)));
    const r = computeDoseTimeDrift('m-1', e);
    expect(r.samples).toBe(12);
    expect(r.direction).toBe('later');
  });

  it('rounds the recommended shift to the configured step', () => {
    const drifts = new Array(12).fill(47);
    const e = makeDailyEntries('m-1', drifts);
    const r5 = computeDoseTimeDrift('m-1', e, { shiftStepMinutes: 5 });
    expect(r5.recommendedTimeShiftMinutes).toBe(45);
    const r15 = computeDoseTimeDrift('m-1', e, { shiftStepMinutes: 15 });
    expect(r15.recommendedTimeShiftMinutes).toBe(45);
    const r30 = computeDoseTimeDrift('m-1', e, { shiftStepMinutes: 30 });
    expect(r30.recommendedTimeShiftMinutes).toBe(60);
  });
});

describe('computeAllDoseTimeDrifts', () => {
  it('produces one report per medication', () => {
    const e = [
      ...makeDailyEntries('m-1', new Array(12).fill(60)),
      ...makeDailyEntries('m-2', new Array(12).fill(-60)),
      ...makeDailyEntries('m-3', new Array(5).fill(0)),
    ];
    const reports = computeAllDoseTimeDrifts(e);
    expect(reports).toHaveLength(3);
    const ids = reports.map((r) => r.medicationId).sort();
    expect(ids).toEqual(['m-1', 'm-2', 'm-3']);
  });

  it('orders reports by confidence descending', () => {
    const e = [
      ...makeDailyEntries('m-1', new Array(30).fill(60)),
      ...makeDailyEntries('m-2', new Array(12).fill(60)),
    ];
    const reports = computeAllDoseTimeDrifts(e);
    expect(reports[0]!.medicationId).toBe('m-1');
    expect(reports[0]!.confidence).toBeGreaterThanOrEqual(reports[1]!.confidence);
  });

  it('skips entries without a medicationId', () => {
    const e: DoseHistoryEntry[] = [
      { dueAt: new Date().toISOString(), takenAt: new Date().toISOString() },
    ];
    const reports = computeAllDoseTimeDrifts(e);
    expect(reports).toHaveLength(0);
  });

  it('returns an empty array on empty input', () => {
    expect(computeAllDoseTimeDrifts([])).toEqual([]);
  });
});
