import { describe, it, expect } from 'vitest';
import {
  seriesFromCounts,
  seriesFromDaily,
  trendSeriesMeta,
  type TrendCell,
} from '../lib/trend-series';

function pcts(cells: TrendCell[]): number[] {
  return cells.map((c) => c.pct);
}

describe('seriesFromCounts', () => {
  it('produces 14 cells by default', () => {
    expect(seriesFromCounts({ taken: 9, scheduled: 10 })).toHaveLength(14);
  });

  it('honours a custom cell count', () => {
    expect(seriesFromCounts({ taken: 9, scheduled: 10 }, { cells: 7 })).toHaveLength(7);
  });

  it('is flat at the current average when there is no prior baseline', () => {
    const cells = seriesFromCounts({ taken: 8, scheduled: 10 });
    expect(new Set(pcts(cells))).toEqual(new Set([80]));
    expect(cells.every((c) => c.segment === 'current')).toBe(true);
    expect(cells.every((c) => c.real === false)).toBe(true);
  });

  it('steps from the prior average (older cells) to the current average (newer cells)', () => {
    // prior 50%, current 90%, 14 cells -> 7 prior @50, 7 current @90.
    const cells = seriesFromCounts({
      taken: 9,
      scheduled: 10,
      priorTaken: 5,
      priorScheduled: 10,
    });
    expect(pcts(cells.slice(0, 7))).toEqual(Array(7).fill(50));
    expect(pcts(cells.slice(7))).toEqual(Array(7).fill(90));
    expect(cells.slice(0, 7).every((c) => c.segment === 'prior')).toBe(true);
    expect(cells.slice(7).every((c) => c.segment === 'current')).toBe(true);
  });

  it('marks only the last cell as today', () => {
    const cells = seriesFromCounts({ taken: 9, scheduled: 10 });
    expect(cells.filter((c) => c.isToday)).toHaveLength(1);
    expect(cells[cells.length - 1]!.isToday).toBe(true);
  });

  it('treats a zero prior-scheduled as no baseline (stays flat)', () => {
    const cells = seriesFromCounts({
      taken: 7,
      scheduled: 10,
      priorTaken: 0,
      priorScheduled: 0,
    });
    expect(new Set(pcts(cells))).toEqual(new Set([70]));
  });

  it('clamps a bad cell count back to the default', () => {
    expect(seriesFromCounts({ taken: 1, scheduled: 1 }, { cells: 0 })).toHaveLength(14);
    expect(seriesFromCounts({ taken: 1, scheduled: 1 }, { cells: -5 })).toHaveLength(14);
  });

  it('never invents per-day variance (every value is a window average)', () => {
    const cells = seriesFromCounts({
      taken: 6,
      scheduled: 10,
      priorTaken: 9,
      priorScheduled: 10,
    });
    // Exactly two distinct values: prior 90 and current 60. No wobble.
    expect(new Set(pcts(cells))).toEqual(new Set([90, 60]));
  });
});

describe('seriesFromDaily', () => {
  it('takes the trailing N values and marks them real', () => {
    const cells = seriesFromDaily([10, 20, 30, 40, 50], { cells: 3 });
    expect(pcts(cells)).toEqual([30, 40, 50]);
    expect(cells.every((c) => c.real)).toBe(true);
    expect(cells[cells.length - 1]!.isToday).toBe(true);
  });

  it('clamps each datum into 0..100', () => {
    const cells = seriesFromDaily([-20, 150, 55], { cells: 3 });
    expect(pcts(cells)).toEqual([0, 100, 55]);
  });

  it('handles a series shorter than the cell count', () => {
    const cells = seriesFromDaily([42], { cells: 14 });
    expect(cells).toHaveLength(1);
    expect(cells[0]!.isToday).toBe(true);
  });
});

describe('trendSeriesMeta', () => {
  it('reports a step and both window averages when a baseline exists', () => {
    const meta = trendSeriesMeta({ taken: 9, scheduled: 10, priorTaken: 5, priorScheduled: 10 });
    expect(meta.hasStep).toBe(true);
    expect(meta.currentPct).toBe(90);
    expect(meta.priorPct).toBe(50);
    expect(meta.cells).toHaveLength(14);
  });

  it('reports no step and equal averages with no baseline', () => {
    const meta = trendSeriesMeta({ taken: 8, scheduled: 10 });
    expect(meta.hasStep).toBe(false);
    expect(meta.currentPct).toBe(80);
    expect(meta.priorPct).toBe(80);
  });
});
