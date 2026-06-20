import { describe, it, expect } from 'vitest';
import {
  summarizeWeightTrend,
  projectWeight,
  type WeightEntry,
} from '../src/weight-trend';

function at(day: number, hour = 8): string {
  // Use local-time constructor; aggregator is local-day-naive.
  const d = new Date(2026, 5, 15, hour, 0, 0, 0);
  d.setDate(d.getDate() + day);
  return d.toISOString();
}

describe('summarizeWeightTrend', () => {
  it('returns insufficient for empty input', () => {
    const r = summarizeWeightTrend([]);
    expect(r.series).toHaveLength(0);
    expect(r.summary.direction).toBe('insufficient');
    expect(r.summary.count).toBe(0);
  });

  it('rejects non-positive weights', () => {
    expect(() => summarizeWeightTrend([{ takenAt: at(0), weight: 0 }])).toThrow();
    expect(() => summarizeWeightTrend([{ takenAt: at(0), weight: -1 }])).toThrow();
  });

  it('computes rolling and EMA for a clean series', () => {
    const entries: WeightEntry[] = Array.from({ length: 14 }, (_, i) => ({
      takenAt: at(i),
      weight: 80 + Math.sin(i) * 0.2,
    }));
    const r = summarizeWeightTrend(entries);
    expect(r.series).toHaveLength(14);
    // No outliers in a tight ~80 kg series.
    expect(r.summary.outlierCount).toBe(0);
    // Means should be near 80 kg.
    expect(r.summary.rolling7).toBeGreaterThan(79);
    expect(r.summary.rolling7).toBeLessThan(81);
    expect(r.summary.rolling30).toBeGreaterThan(79);
    expect(r.summary.rolling30).toBeLessThan(81);
    expect(r.summary.ema).toBeGreaterThan(79);
    expect(r.summary.ema).toBeLessThan(81);
    expect(r.summary.direction).toBe('stable');
  });

  it('detects gaining trend when recent mean > 30-day baseline', () => {
    const entries: WeightEntry[] = [];
    // 30 prior days near 75 kg.
    for (let i = -30; i < -7; i++) entries.push({ takenAt: at(i), weight: 75 });
    // Last 7 days near 77 kg (recent gain).
    for (let i = -7; i <= 0; i++) entries.push({ takenAt: at(i), weight: 77 });
    const r = summarizeWeightTrend(entries);
    expect(r.summary.direction).toBe('gaining');
    expect(r.summary.deltaShortVsLong).toBeGreaterThan(0);
  });

  it('detects losing trend with negative delta', () => {
    const entries: WeightEntry[] = [];
    for (let i = -30; i < -7; i++) entries.push({ takenAt: at(i), weight: 90 });
    for (let i = -7; i <= 0; i++) entries.push({ takenAt: at(i), weight: 87 });
    const r = summarizeWeightTrend(entries);
    expect(r.summary.direction).toBe('losing');
    expect(r.summary.deltaShortVsLong).toBeLessThan(0);
  });

  it('flags a single far outlier and excludes it from smoothing', () => {
    const entries: WeightEntry[] = Array.from({ length: 9 }, (_, i) => ({
      takenAt: at(i),
      weight: 72,
    }));
    // Slip a bad reading at index 5.
    entries[5] = { takenAt: at(5), weight: 92 };
    const r = summarizeWeightTrend(entries);
    expect(r.summary.outlierCount).toBe(1);
    expect(r.series[5]!.outlier).toBe(true);
    // The smoothed lines should stay near 72, not get yanked by the 92.
    expect(r.summary.rolling7).toBeLessThan(73);
    expect(r.summary.ema).toBeLessThan(73);
  });

  it('does not flag outliers below the minimum-readings threshold', () => {
    const entries: WeightEntry[] = [
      { takenAt: at(0), weight: 70 },
      { takenAt: at(1), weight: 71 },
      { takenAt: at(2), weight: 95 },
    ];
    const r = summarizeWeightTrend(entries);
    expect(r.summary.outlierCount).toBe(0); // < 5 readings -> no MAD test
  });

  it('respects custom emaAlpha', () => {
    const entries: WeightEntry[] = Array.from({ length: 10 }, (_, i) => ({
      takenAt: at(i),
      weight: 80,
    }));
    const r1 = summarizeWeightTrend(entries, { emaAlpha: 0.1 });
    const r2 = summarizeWeightTrend(entries, { emaAlpha: 0.9 });
    // Both converge to 80 on a flat series.
    expect(r1.summary.ema).toBeCloseTo(80, 1);
    expect(r2.summary.ema).toBeCloseTo(80, 1);
  });

  it('throws on invalid emaAlpha', () => {
    expect(() => summarizeWeightTrend([{ takenAt: at(0), weight: 70 }], { emaAlpha: 0 })).toThrow();
    expect(() => summarizeWeightTrend([{ takenAt: at(0), weight: 70 }], { emaAlpha: 1.5 })).toThrow();
  });

  it('stableDelta tolerance widens stable band', () => {
    const entries: WeightEntry[] = [];
    for (let i = -30; i < -7; i++) entries.push({ takenAt: at(i), weight: 75 });
    for (let i = -7; i <= 0; i++) entries.push({ takenAt: at(i), weight: 76 });
    // delta = 1.0; default stable=0.5 -> gaining
    expect(summarizeWeightTrend(entries).summary.direction).toBe('gaining');
    // Wider tolerance -> stable
    expect(summarizeWeightTrend(entries, { stableDelta: 1.5 }).summary.direction).toBe('stable');
  });

  it('series carries forward EMA over outliers', () => {
    const entries: WeightEntry[] = Array.from({ length: 9 }, (_, i) => ({
      takenAt: at(i),
      weight: 72,
    }));
    entries[5] = { takenAt: at(5), weight: 200 };
    const r = summarizeWeightTrend(entries);
    expect(r.series[5]!.outlier).toBe(true);
    expect(r.series[5]!.ema).toBeDefined();
    // EMA right around 72 even though raw reading was 200.
    expect(r.series[5]!.ema!).toBeLessThan(73);
  });

  it('produces a descriptive message', () => {
    const r = summarizeWeightTrend([{ takenAt: at(0), weight: 70 }]);
    expect(r.summary.message).toMatch(/1 reading logged/);
  });
});

describe('projectWeight', () => {
  it('returns undefined when trend is insufficient', () => {
    const r = summarizeWeightTrend([{ takenAt: at(0), weight: 70 }]);
    expect(projectWeight(r, 7)).toBeUndefined();
  });

  it('returns undefined when stable', () => {
    const entries: WeightEntry[] = Array.from({ length: 30 }, (_, i) => ({
      takenAt: at(i - 30),
      weight: 80,
    }));
    const r = summarizeWeightTrend(entries);
    expect(projectWeight(r, 30)).toBeUndefined();
  });

  it('projects upward when gaining', () => {
    const entries: WeightEntry[] = [];
    for (let i = -30; i < -7; i++) entries.push({ takenAt: at(i), weight: 75 });
    for (let i = -7; i <= 0; i++) entries.push({ takenAt: at(i), weight: 77 });
    const r = summarizeWeightTrend(entries);
    const future = projectWeight(r, 30);
    expect(future).toBeDefined();
    expect(future!).toBeGreaterThan(r.summary.ema!);
  });

  it('projects downward when losing', () => {
    const entries: WeightEntry[] = [];
    for (let i = -30; i < -7; i++) entries.push({ takenAt: at(i), weight: 90 });
    for (let i = -7; i <= 0; i++) entries.push({ takenAt: at(i), weight: 87 });
    const r = summarizeWeightTrend(entries);
    const future = projectWeight(r, 30);
    expect(future).toBeDefined();
    expect(future!).toBeLessThan(r.summary.ema!);
  });
});
