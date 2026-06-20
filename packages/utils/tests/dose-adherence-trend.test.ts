import { describe, it, expect } from 'vitest';
import {
  computeAdherenceTrend,
  daysUntilBelow,
  type AdherenceTrend,
} from '../src/dose-adherence-trend';
import {
  aggregateDoseHistory,
  type DoseHistoryEntry,
  type DoseAggregation,
} from '../src/dose-history-aggregator';

function makeAggregation(
  weeklyAdherence: number[],
  windowStart: Date,
): DoseAggregation {
  // Build dose entries that produce the given adherence per week.
  const entries: DoseHistoryEntry[] = [];
  // 10 doses per week; produce taken/missed counts to match adherence.
  for (let w = 0; w < weeklyAdherence.length; w++) {
    const weekStart = new Date(windowStart);
    weekStart.setDate(weekStart.getDate() + w * 7);
    const targetAdherence = weeklyAdherence[w]!;
    const total = 10;
    const taken = Math.round(targetAdherence * total);
    for (let i = 0; i < total; i++) {
      const due = new Date(weekStart);
      due.setDate(due.getDate() + i % 7);
      due.setHours(8 + (i % 12), 0, 0, 0);
      entries.push({
        dueAt: due.toISOString(),
        takenAt: i < taken ? due.toISOString() : null,
      });
    }
  }
  const from = windowStart;
  const to = new Date(windowStart);
  to.setDate(to.getDate() + weeklyAdherence.length * 7 - 1);
  return aggregateDoseHistory(entries, {
    bucket: 'week',
    from,
    to,
    now: to,
  });
}

const WINDOW_START = new Date(2026, 0, 5); // Mon Jan 5, 2026

describe('computeAdherenceTrend', () => {
  it('returns insufficient on empty aggregation', () => {
    const empty = aggregateDoseHistory([], {
      bucket: 'day',
      from: WINDOW_START,
      to: WINDOW_START,
    });
    const r = computeAdherenceTrend(empty);
    expect(r.direction).toBe('insufficient');
    expect(r.usedBuckets).toBe(0);
  });

  it('detects improving trend', () => {
    const agg = makeAggregation([0.5, 0.6, 0.7, 0.8, 0.9, 0.95], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.direction).toBe('improving');
    expect(r.slopePerDay).toBeGreaterThan(0);
    expect(r.projectedAt30Days).toBeDefined();
    expect(r.projectedAt30Days!).toBeGreaterThan(0.9);
  });

  it('detects declining trend', () => {
    const agg = makeAggregation([0.95, 0.9, 0.8, 0.7, 0.6, 0.5], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.direction).toBe('declining');
    expect(r.slopePerDay).toBeLessThan(0);
    expect(r.belowThresholdAtProjection).toBe(true);
  });

  it('detects stable trend with low slope', () => {
    const agg = makeAggregation([0.8, 0.8, 0.8, 0.8, 0.8, 0.8], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.direction).toBe('stable');
    expect(Math.abs(r.slopePerDay)).toBeLessThan(0.0005);
  });

  it('flags when projection is below threshold even when stable today', () => {
    const agg = makeAggregation([0.9, 0.85, 0.8, 0.75, 0.7], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.direction).toBe('declining');
    expect(r.belowThresholdAtProjection).toBe(true);
    expect(r.message).toMatch(/below 80%/);
  });

  it('respects custom belowThreshold', () => {
    const agg = makeAggregation([0.95, 0.9, 0.85], WINDOW_START);
    const strict = computeAdherenceTrend(agg, { belowThreshold: 0.95 });
    expect(strict.belowThresholdAtProjection).toBe(true);
    const loose = computeAdherenceTrend(agg, { belowThreshold: 0.5 });
    expect(loose.belowThresholdAtProjection).toBe(false);
  });

  it('returns r2 close to 1 for a perfect line', () => {
    const agg = makeAggregation([0.5, 0.6, 0.7, 0.8, 0.9, 1.0], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.r2).toBeGreaterThan(0.9);
  });

  it('flags insufficient when r2 is weak even with non-trivial slope', () => {
    // Bouncy series: net upward but inconsistent.
    const agg = makeAggregation([0.5, 0.9, 0.4, 0.95, 0.45, 0.95], WINDOW_START);
    const r = computeAdherenceTrend(agg, { minR2: 0.5 });
    expect(r.direction).toBe('insufficient');
  });

  it('handles single bucket as insufficient', () => {
    const agg = makeAggregation([0.7], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.direction).toBe('insufficient');
    expect(r.r2).toBeUndefined();
  });

  it('respects projectionDays parameter', () => {
    const agg = makeAggregation([0.5, 0.6, 0.7, 0.8, 0.9], WINDOW_START);
    const r30 = computeAdherenceTrend(agg, { projectionDays: 30 });
    const r90 = computeAdherenceTrend(agg, { projectionDays: 90 });
    // Both projections clamp at 1.0 on this steep improving series.
    expect(r30.projectedAt30Days).toBeDefined();
    expect(r90.projectedAt30Days).toBeDefined();
    expect(r90.projectedAt30Days!).toBeGreaterThanOrEqual(r30.projectedAt30Days!);
  });

  it('clamps projection to [0, 1]', () => {
    // Very steep improving line will overshoot 1.0 without clamp.
    const agg = makeAggregation([0.1, 0.5, 0.9], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.projectedAt30Days!).toBeLessThanOrEqual(1);
    expect(r.projectedAt30Days!).toBeGreaterThanOrEqual(0);
  });

  it('message describes direction in %/month language', () => {
    const agg = makeAggregation([0.5, 0.6, 0.7, 0.8], WINDOW_START);
    const r = computeAdherenceTrend(agg);
    expect(r.message).toMatch(/improving by.*per month/);
  });
});

describe('daysUntilBelow', () => {
  it('returns null when not declining', () => {
    const trend: AdherenceTrend = {
      usedBuckets: 4,
      totalBuckets: 4,
      slopePerDay: 0.001,
      intercept: 0.8,
      direction: 'improving',
      belowThresholdAtProjection: false,
      message: '',
      currentAdherence: 0.9,
    };
    expect(daysUntilBelow(trend)).toBeNull();
  });

  it('returns 0 when already below threshold', () => {
    const trend: AdherenceTrend = {
      usedBuckets: 4,
      totalBuckets: 4,
      slopePerDay: -0.01,
      intercept: 1.0,
      direction: 'declining',
      belowThresholdAtProjection: true,
      message: '',
      currentAdherence: 0.6,
    };
    expect(daysUntilBelow(trend)).toBe(0);
  });

  it('computes days until crossing threshold for declining trend', () => {
    const trend: AdherenceTrend = {
      usedBuckets: 4,
      totalBuckets: 4,
      slopePerDay: -0.01, // -1% per day
      intercept: 1.0,
      direction: 'declining',
      belowThresholdAtProjection: true,
      message: '',
      currentAdherence: 0.9,
    };
    // From 0.9, slope -0.01/day, reach 0.8 in 10 days.
    expect(daysUntilBelow(trend, 0.8)).toBe(10);
  });

  it('returns null when crossing exceeds horizon', () => {
    const trend: AdherenceTrend = {
      usedBuckets: 4,
      totalBuckets: 4,
      slopePerDay: -0.0001,
      intercept: 1.0,
      direction: 'declining',
      belowThresholdAtProjection: false,
      message: '',
      currentAdherence: 0.95,
    };
    // (0.8 - 0.95) / -0.0001 = 1500 days; horizon 365 -> null.
    expect(daysUntilBelow(trend, 0.8)).toBeNull();
  });
});
