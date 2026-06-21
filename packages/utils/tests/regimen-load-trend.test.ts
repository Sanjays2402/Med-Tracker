import { describe, it, expect } from 'vitest';
import {
  computeRegimenLoadTrend,
  topRisingComponents,
  type RegimenLoadSnapshot,
} from '../src/regimen-load-trend';
import type { RegimenLoadScore } from '../src/regimen-load-score';

function score(
  total: number,
  components: Partial<{
    dosing: number;
    pills: number;
    monitoring: number;
    cost: number;
    prn: number;
  }> = {},
): RegimenLoadScore {
  const d = components.dosing ?? total;
  const p = components.pills ?? total;
  const m = components.monitoring ?? total;
  const c = components.cost ?? total;
  const r = components.prn ?? total;
  return {
    total,
    band: total < 25 ? 'light' : total < 50 ? 'moderate' : total < 75 ? 'heavy' : 'severe',
    components: {
      dosing: { score: d, inputs: {}, reason: '' },
      pills: { score: p, inputs: {}, reason: '' },
      monitoring: { score: m, inputs: {}, reason: '' },
      cost: { score: c, inputs: {}, reason: '' },
      prn: { score: r, inputs: {}, reason: '' },
    },
    weightedContributions: { dosing: 0, pills: 0, monitoring: 0, cost: 0, prn: 0 },
    summary: '',
  };
}

function snap(takenAt: string, totalScore: number): RegimenLoadSnapshot {
  return { takenAt, score: score(totalScore) };
}

const AS_OF = new Date(2026, 11, 31); // 2026-12-31

describe('computeRegimenLoadTrend — basic structure', () => {
  it('returns one entry per configured window', () => {
    const trend = computeRegimenLoadTrend(
      [snap('2026-12-01', 40), snap('2026-09-01', 35), snap('2026-06-01', 30)],
      { asOf: AS_OF },
    );
    expect(trend.windowsDays).toEqual([30, 90, 180]);
    expect(trend.windows).toHaveLength(3);
    expect(trend.asOf).toBe('2026-12-31');
  });

  it('respects custom windowsDays and sorts them ascending', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-01', 40)], {
      asOf: AS_OF,
      windowsDays: [365, 60, 7],
    });
    expect(trend.windowsDays).toEqual([7, 60, 365]);
  });

  it('drops invalid window lengths silently', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-01', 40)], {
      asOf: AS_OF,
      windowsDays: [30, -1, 0, NaN, 60],
    });
    expect(trend.windowsDays).toEqual([30, 60]);
  });

  it('returns insufficient + empty when windowsDays is empty', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-01', 40)], {
      asOf: AS_OF,
      windowsDays: [],
    });
    expect(trend.windows).toHaveLength(0);
    expect(trend.direction).toBe('insufficient');
    expect(trend.componentDirections.dosing).toBe('insufficient');
  });

  it('skips snapshots later than asOf', () => {
    const trend = computeRegimenLoadTrend(
      [snap('2027-01-15', 99), snap('2026-12-01', 40), snap('2026-09-01', 35)],
      { asOf: AS_OF },
    );
    for (const w of trend.windows) {
      // 99 must not contribute to any mean.
      expect(w.meanTotal).toBeLessThan(50);
    }
  });

  it('drops snapshots with unparseable takenAt silently', () => {
    const trend = computeRegimenLoadTrend(
      [
        { takenAt: 'not-a-date', score: score(99) },
        snap('2026-12-15', 40),
        snap('2026-09-15', 35),
      ],
      { asOf: AS_OF },
    );
    expect(trend.windows[0]?.meanTotal).toBe(40);
  });
});

describe('computeRegimenLoadTrend — direction classification', () => {
  it('classifies a steady regimen as stable', () => {
    // Snapshots covering 30d, 90d, 180d windows with ~40 score.
    const snapshots: RegimenLoadSnapshot[] = [
      snap('2026-07-15', 40),
      snap('2026-08-15', 41),
      snap('2026-10-01', 39),
      snap('2026-11-15', 41),
      snap('2026-12-10', 40),
      snap('2026-12-25', 41),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.direction).toBe('stable');
    expect(trend.message).toMatch(/Stable around/);
  });

  it('classifies a climbing burden as rising', () => {
    // Old snapshot at 20 inside 180d window, recent at 60.
    const snapshots: RegimenLoadSnapshot[] = [];
    snapshots.push(snap('2026-07-15', 20));
    snapshots.push(snap('2026-08-01', 25));
    snapshots.push(snap('2026-09-01', 30));
    snapshots.push(snap('2026-12-01', 60));
    snapshots.push(snap('2026-12-15', 62));
    snapshots.push(snap('2026-12-28', 65));
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.direction).toBe('rising');
    expect(trend.message).toMatch(/Rising/);
    expect((trend.delta ?? 0) > 0).toBe(true);
  });

  it('classifies a dropping burden as falling', () => {
    const snapshots: RegimenLoadSnapshot[] = [];
    snapshots.push(snap('2026-07-15', 70));
    snapshots.push(snap('2026-08-01', 65));
    snapshots.push(snap('2026-09-01', 60));
    snapshots.push(snap('2026-12-01', 30));
    snapshots.push(snap('2026-12-15', 28));
    snapshots.push(snap('2026-12-28', 25));
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.direction).toBe('falling');
    expect(trend.message).toMatch(/Falling/);
    expect((trend.delta ?? 0) < 0).toBe(true);
  });

  it('respects stableBandDelta override', () => {
    // 30pt delta: rising at default 5pt band, stable at 50pt band.
    const trend = computeRegimenLoadTrend(
      [
        snap('2026-12-15', 35), // in 30d window
        snap('2026-07-15', 5), // in 180d (not in 30d/90d)
      ],
      { asOf: AS_OF, stableBandDelta: 50 },
    );
    expect(trend.direction).toBe('stable');
  });

  it('reports insufficient when largest window has fewer than minSnapshots', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-15', 40)], {
      asOf: AS_OF,
      minSnapshots: 2,
    });
    expect(trend.direction).toBe('insufficient');
    expect(trend.message).toBe('Not enough snapshots to compute a trend.');
  });

  it('handles a 1-snapshot regimen with explicit minSnapshots=1', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-15', 40)], {
      asOf: AS_OF,
      minSnapshots: 1,
    });
    // Still insufficient because only one window has data (the latest);
    // we need ≥2 real points to compute a trend at all.
    expect(trend.direction).toBe('insufficient');
  });
});

describe('computeRegimenLoadTrend — window math', () => {
  it('takes the mean of in-window snapshots (not the latest)', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      snap('2026-12-10', 20),
      snap('2026-12-20', 80),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.windows[0]?.meanTotal).toBe(50);
  });

  it('reports snapshotCount per window', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      snap('2026-12-15', 40), // in 30d
      snap('2026-10-15', 40), // in 90d, not 30d
      snap('2026-07-15', 40), // in 180d, not 90d
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.windows[0]?.snapshotCount).toBe(1);
    expect(trend.windows[1]?.snapshotCount).toBe(2);
    expect(trend.windows[2]?.snapshotCount).toBe(3);
  });

  it('zero-snapshot windows report meanTotal=0 and light band', () => {
    const trend = computeRegimenLoadTrend(
      [snap('2026-07-15', 60)], // only in 180d window
      { asOf: AS_OF },
    );
    expect(trend.windows[0]?.snapshotCount).toBe(0);
    expect(trend.windows[0]?.meanTotal).toBe(0);
    expect(trend.windows[0]?.meanBand).toBe('light');
  });

  it('reports measurementStart and measurementEnd ISO strings for every window', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-15', 40), snap('2026-09-15', 30)], {
      asOf: AS_OF,
    });
    // 30d window: 2026-12-02 to 2026-12-31
    expect(trend.windows[0]?.measurementEnd).toBe('2026-12-31');
    expect(trend.windows[0]?.measurementStart).toBe('2026-12-02');
    expect(trend.windows[2]?.measurementStart).toBe('2026-07-05');
  });

  it('classifies meanBand correctly', () => {
    const trend = computeRegimenLoadTrend(
      [snap('2026-12-15', 80), snap('2026-12-20', 80)],
      { asOf: AS_OF },
    );
    expect(trend.windows[0]?.meanBand).toBe('severe');
  });
});

describe('computeRegimenLoadTrend — per-component breakdown', () => {
  function snapC(
    takenAt: string,
    components: { dosing: number; pills: number; monitoring: number; cost: number; prn: number },
  ): RegimenLoadSnapshot {
    const total = (components.dosing + components.pills + components.monitoring + components.cost + components.prn) / 5;
    return { takenAt, score: score(total, components) };
  }

  it('classifies dosing rising while pills stable', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      // Baseline window (180d, starts 2026-07-05): dosing 20, pills 40.
      snapC('2026-07-15', { dosing: 20, pills: 40, monitoring: 30, cost: 30, prn: 0 }),
      snapC('2026-08-01', { dosing: 20, pills: 40, monitoring: 30, cost: 30, prn: 0 }),
      // Recent window (30d): dosing 60, pills 40.
      snapC('2026-12-20', { dosing: 60, pills: 40, monitoring: 30, cost: 30, prn: 0 }),
      snapC('2026-12-15', { dosing: 60, pills: 40, monitoring: 30, cost: 30, prn: 0 }),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.componentDirections.dosing).toBe('rising');
    expect(trend.componentDirections.pills).toBe('stable');
  });

  it('reports componentDeltas as latest - baseline per component', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      snapC('2026-07-15', { dosing: 20, pills: 30, monitoring: 0, cost: 0, prn: 0 }),
      snapC('2026-12-20', { dosing: 60, pills: 30, monitoring: 0, cost: 0, prn: 0 }),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    expect(trend.componentDeltas.dosing).toBe(20);
    expect(trend.componentDeltas.pills).toBe(0);
  });
});

describe('topRisingComponents', () => {
  function snapC(
    takenAt: string,
    components: { dosing: number; pills: number; monitoring: number; cost: number; prn: number },
  ): RegimenLoadSnapshot {
    const total = (components.dosing + components.pills + components.monitoring + components.cost + components.prn) / 5;
    return { takenAt, score: score(total, components) };
  }

  it('returns rising components sorted by delta desc', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      snapC('2026-07-15', { dosing: 20, pills: 30, monitoring: 10, cost: 0, prn: 0 }),
      snapC('2026-12-20', { dosing: 60, pills: 45, monitoring: 5, cost: 0, prn: 0 }),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    const top = topRisingComponents(trend);
    // Baseline window (180d) means: dosing (20+60)/2=40, pills (30+45)/2=37.5,
    // monitoring (10+5)/2=7.5. Latest window (30d): dosing 60, pills 45,
    // monitoring 5. Deltas: dosing +20, pills +7.5, monitoring -2.5.
    expect(top.map((t) => t.component)).toEqual(['dosing', 'pills']);
    expect(top[0]?.delta).toBe(20);
    expect(top[1]?.delta).toBe(7.5);
  });

  it('honors topN limit', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      snapC('2026-07-15', { dosing: 10, pills: 10, monitoring: 10, cost: 10, prn: 0 }),
      snapC('2026-12-20', { dosing: 40, pills: 30, monitoring: 25, cost: 20, prn: 0 }),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    const top = topRisingComponents(trend, 2);
    expect(top).toHaveLength(2);
    expect(top.map((t) => t.component)).toEqual(['dosing', 'pills']);
  });

  it('returns empty array when direction is insufficient', () => {
    const trend = computeRegimenLoadTrend([snap('2026-12-20', 40)], { asOf: AS_OF });
    expect(topRisingComponents(trend)).toEqual([]);
  });

  it('returns empty array when no components rose', () => {
    const snapshots: RegimenLoadSnapshot[] = [
      snap('2026-07-15', 60),
      snap('2026-12-20', 30),
    ];
    const trend = computeRegimenLoadTrend(snapshots, { asOf: AS_OF });
    const top = topRisingComponents(trend);
    expect(top).toEqual([]);
  });
});
