import { describe, it, expect } from 'vitest';
import {
  computeRefusalTrend,
  summarizeRefusalTrend,
} from '../src/medication-refusal-trend';
import type { NormalizedRefusal, RefusalReasonCode } from '../src/medication-refusal-log';

const NOW = new Date(2026, 5, 21); // 2026-06-21
const DAY = 86_400_000;

function refusal(o: Partial<NormalizedRefusal> & { daysAgo?: number }): NormalizedRefusal {
  const ms = NOW.getTime() - (o.daysAgo ?? 0) * DAY;
  const iso = new Date(ms).toISOString();
  const reason: RefusalReasonCode = o.reason ?? 'declined';
  const tol = reason === 'nausea' || reason === 'side-effect';
  return {
    id: o.id ?? `r-${Math.random()}`,
    medicationId: o.medicationId ?? 'm1',
    dueAt: o.dueAt ?? iso,
    loggedAt: o.loggedAt ?? iso,
    reason,
    excludedFromAdherence: o.excludedFromAdherence ?? false,
    tolerabilitySignal: o.tolerabilitySignal ?? tol,
    ...(o.medicationName ? { medicationName: o.medicationName } : {}),
  };
}

describe('computeRefusalTrend — windowing', () => {
  it('emits one window per requested length, ascending', () => {
    const r = computeRefusalTrend([refusal({ daysAgo: 1 })], {
      asOf: NOW,
      windowsDays: [180, 30, 90],
    });
    expect(r.windowsDays).toEqual([30, 90, 180]);
    expect(r.perMedication[0]?.windows.map((w) => w.windowDays)).toEqual([30, 90, 180]);
  });

  it('drops non-finite or non-positive window lengths', () => {
    const r = computeRefusalTrend([refusal({ daysAgo: 1 })], {
      asOf: NOW,
      windowsDays: [30, NaN, -5, 90],
    });
    expect(r.windowsDays).toEqual([30, 90]);
  });

  it('returns empty report when no valid windows', () => {
    const r = computeRefusalTrend([refusal({ daysAgo: 1 })], {
      asOf: NOW,
      windowsDays: [-1, NaN],
    });
    expect(r.perMedication).toEqual([]);
    expect(r.rising).toEqual([]);
  });

  it('counts only refusals on or before asOf', () => {
    const r = computeRefusalTrend(
      [refusal({ daysAgo: -2 }), refusal({ daysAgo: 5 })],
      { asOf: NOW },
    );
    expect(r.perMedication[0]?.windows[0]?.count).toBe(1);
  });

  it('window count uses the inclusive [asOf-window+1, asOf] range', () => {
    const r = computeRefusalTrend(
      [
        refusal({ daysAgo: 0 }),
        refusal({ daysAgo: 29 }),
        refusal({ daysAgo: 30 }),
        refusal({ daysAgo: 100 }),
      ],
      { asOf: NOW, windowsDays: [30, 90, 180] },
    );
    const wins = r.perMedication[0]?.windows ?? [];
    expect(wins[0]?.count).toBe(2); // 0d + 29d inside 30d window
    expect(wins[1]?.count).toBe(3); // includes 30d ago
    expect(wins[2]?.count).toBe(4); // all
  });
});

describe('computeRefusalTrend — direction', () => {
  it('rises when shortest window has higher density than longest', () => {
    // 4 refusals in last 30d, 5 total over 180d
    const refs = [
      ...Array.from({ length: 4 }, (_, i) => refusal({ daysAgo: i, medicationId: 'a' })),
      refusal({ daysAgo: 170, medicationId: 'a' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 2 });
    expect(r.perMedication[0]?.direction).toBe('rising');
    expect(r.perMedication[0]?.delta).toBeGreaterThan(0);
    expect(r.rising).toHaveLength(1);
  });

  it('falls when shortest window has lower density than longest', () => {
    // 1 refusal recent + 18 historical clustered at 100-170d
    const refs = [
      refusal({ daysAgo: 2, medicationId: 'a' }),
      ...Array.from({ length: 18 }, (_, i) => refusal({ daysAgo: 100 + i * 3, medicationId: 'a' })),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 1, stableBandDelta: 0.005 });
    expect(r.perMedication[0]?.direction).toBe('falling');
    expect(r.perMedication[0]?.delta).toBeLessThan(0);
  });

  it('stable when delta is within the stable band', () => {
    // Evenly spaced refusals across 180d
    const refs = Array.from({ length: 18 }, (_, i) => refusal({ daysAgo: i * 10, medicationId: 'a' }));
    const r = computeRefusalTrend(refs, { asOf: NOW, stableBandDelta: 0.1, minRecentRefusals: 1 });
    expect(r.perMedication[0]?.direction).toBe('stable');
  });

  it('insufficient when only the longest window has refusals (other windows empty)', () => {
    const r = computeRefusalTrend([refusal({ daysAgo: 170 })], { asOf: NOW });
    expect(r.perMedication[0]?.direction).toBe('insufficient');
  });

  it('insufficient when recent count below minRecentRefusals', () => {
    const refs = [refusal({ daysAgo: 1, medicationId: 'a' }), refusal({ daysAgo: 100, medicationId: 'a' })];
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 2 });
    expect(r.perMedication[0]?.direction).toBe('insufficient');
  });

  it('respects custom minRecentRefusals', () => {
    const refs = [refusal({ daysAgo: 1, medicationId: 'a' }), refusal({ daysAgo: 100, medicationId: 'a' })];
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 1, stableBandDelta: 0 });
    // Should NOT be insufficient now
    expect(r.perMedication[0]?.direction).not.toBe('insufficient');
  });
});

describe('computeRefusalTrend — tolerability lead flag', () => {
  it('raises risingTolerability when latest count + share meet defaults', () => {
    // Default: leadCount=2, leadShare=0.4. 2 nausea out of 3 recent.
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 5, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 10, medicationId: 'a', reason: 'declined' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    expect(r.perMedication[0]?.risingTolerability).toBe(true);
    expect(r.risingTolerability).toHaveLength(1);
  });

  it('does NOT raise when tolerability share too low', () => {
    // 1 nausea out of 5 = share 0.2 (below default 0.4)
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 5, medicationId: 'a', reason: 'declined' }),
      refusal({ daysAgo: 10, medicationId: 'a', reason: 'declined' }),
      refusal({ daysAgo: 15, medicationId: 'a', reason: 'declined' }),
      refusal({ daysAgo: 20, medicationId: 'a', reason: 'sleeping' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    expect(r.perMedication[0]?.risingTolerability).toBe(false);
  });

  it('does NOT raise when tolerability count too low', () => {
    const refs = [refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' })];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    expect(r.perMedication[0]?.risingTolerability).toBe(false);
  });

  it('respects custom leadTolerabilityCount and leadTolerabilityShare', () => {
    const refs = [refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' })];
    const r = computeRefusalTrend(refs, {
      asOf: NOW,
      leadTolerabilityCount: 1,
      leadTolerabilityShare: 0.5,
    });
    expect(r.perMedication[0]?.risingTolerability).toBe(true);
  });

  it('headline cites the recent tolerability breakdown when lead flag trips', () => {
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 3, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 8, medicationId: 'a', reason: 'side-effect' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    expect(r.perMedication[0]?.message).toContain('Tolerability climbing');
    expect(r.perMedication[0]?.message).toContain('2 nausea');
    expect(r.perMedication[0]?.message).toContain('1 side-effect');
  });

  it('tolerabilityDirection is independent of overall direction', () => {
    // Overall stable; tolerability rising
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 5, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 60, medicationId: 'a', reason: 'declined' }),
      refusal({ daysAgo: 120, medicationId: 'a', reason: 'declined' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 2, stableBandDelta: 0.02 });
    expect(r.perMedication[0]?.tolerabilityDirection).toBe('rising');
  });
});

describe('computeRefusalTrend — densities', () => {
  it('computes refusals-per-day correctly', () => {
    // 6 refusals in 30d = 0.2/day
    const refs = Array.from({ length: 6 }, (_, i) => refusal({ daysAgo: i * 5, medicationId: 'a' }));
    const r = computeRefusalTrend(refs, { asOf: NOW, windowsDays: [30] });
    expect(r.perMedication[0]?.windows[0]?.densityPerDay).toBeCloseTo(0.2, 4);
  });

  it('tracks tolerability count separately', () => {
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a', reason: 'nausea' }),
      refusal({ daysAgo: 5, medicationId: 'a', reason: 'declined' }),
      refusal({ daysAgo: 10, medicationId: 'a', reason: 'side-effect' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW, windowsDays: [30] });
    expect(r.perMedication[0]?.windows[0]?.tolerabilityCount).toBe(2);
    expect(r.perMedication[0]?.windows[0]?.count).toBe(3);
  });

  it('marks windows with no refusals as empty', () => {
    const refs = [refusal({ daysAgo: 100, medicationId: 'a' })];
    const r = computeRefusalTrend(refs, { asOf: NOW, windowsDays: [30, 90, 180] });
    const wins = r.perMedication[0]?.windows ?? [];
    expect(wins[0]?.empty).toBe(true); // 30d empty
    expect(wins[1]?.empty).toBe(true); // 90d empty
    expect(wins[2]?.empty).toBe(false); // 180d has 1
  });
});

describe('computeRefusalTrend — sorting + grouping', () => {
  it('sorts rising-tolerability first, then rising, then by name', () => {
    const refs = [
      // medA: stable (will be 'stable' due to band)
      ...Array.from({ length: 12 }, (_, i) => refusal({ daysAgo: i * 15, medicationId: 'medA', medicationName: 'Alpha' })),
      // medB: rising overall but no tolerability
      ...Array.from({ length: 5 }, (_, i) => refusal({ daysAgo: i, medicationId: 'medB', medicationName: 'Beta', reason: 'declined' })),
      // medC: rising tolerability
      refusal({ daysAgo: 1, medicationId: 'medC', medicationName: 'Carlie', reason: 'nausea' }),
      refusal({ daysAgo: 3, medicationId: 'medC', medicationName: 'Carlie', reason: 'nausea' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 2 });
    const order = r.perMedication.map((m) => m.medicationName);
    // medC (rising tolerability) first; medB (rising) second
    expect(order[0]).toBe('Carlie');
    expect(order[1]).toBe('Beta');
  });

  it('groups refusals across medications', () => {
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a' }),
      refusal({ daysAgo: 2, medicationId: 'b' }),
      refusal({ daysAgo: 3, medicationId: 'a' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    expect(r.perMedication).toHaveLength(2);
    expect(r.perMedication.find((m) => m.medicationId === 'a')?.windows[0]?.count).toBe(2);
    expect(r.perMedication.find((m) => m.medicationId === 'b')?.windows[0]?.count).toBe(1);
  });

  it('uses medicationName when present, falls back to id', () => {
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'a', medicationName: 'Apixaban' }),
      refusal({ daysAgo: 2, medicationId: 'a' }), // no name
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    expect(r.perMedication[0]?.medicationName).toBe('Apixaban');
  });
});

describe('computeRefusalTrend — edge cases', () => {
  it('returns empty perMedication for empty refusal list', () => {
    const r = computeRefusalTrend([], { asOf: NOW });
    expect(r.perMedication).toEqual([]);
    expect(r.rising).toEqual([]);
  });

  it('skips refusals with unparseable loggedAt', () => {
    const bad: NormalizedRefusal = {
      id: 'r1',
      medicationId: 'a',
      dueAt: '2026-06-20T08:00:00Z',
      loggedAt: 'not-a-date',
      reason: 'declined',
      excludedFromAdherence: false,
      tolerabilitySignal: false,
    };
    const r = computeRefusalTrend([bad], { asOf: NOW });
    expect(r.perMedication).toEqual([]);
  });

  it('uses real today when asOf is omitted', () => {
    const r = computeRefusalTrend([refusal({ daysAgo: 1 })]);
    expect(r.asOf).toBeTruthy();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(r.asOf)).toBe(true);
  });

  it('null latest/baseline density when medication has zero entries on or before asOf', () => {
    // refusal logged in the future — filtered out
    const r = computeRefusalTrend([refusal({ daysAgo: -10 })], { asOf: NOW });
    expect(r.perMedication).toEqual([]);
  });
});

describe('summarizeRefusalTrend', () => {
  it('returns no-history line on empty report', () => {
    const r = computeRefusalTrend([], { asOf: NOW });
    expect(summarizeRefusalTrend(r)).toBe('No refusal history available.');
  });

  it('counts each direction bucket', () => {
    const refs = [
      // medA: rising
      ...Array.from({ length: 4 }, (_, i) => refusal({ daysAgo: i, medicationId: 'medA' })),
      refusal({ daysAgo: 170, medicationId: 'medA' }),
      // medB: stable evenly distributed
      ...Array.from({ length: 18 }, (_, i) => refusal({ daysAgo: i * 10, medicationId: 'medB' })),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW, stableBandDelta: 0.1, minRecentRefusals: 2 });
    const msg = summarizeRefusalTrend(r);
    expect(msg).toContain('across 2 medications');
    expect(msg).toMatch(/rising|falling|stable/);
  });

  it('mentions tolerability lead count when > 0', () => {
    const refs = [
      refusal({ daysAgo: 1, medicationId: 'medA', reason: 'nausea' }),
      refusal({ daysAgo: 3, medicationId: 'medA', reason: 'nausea' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    const msg = summarizeRefusalTrend(r);
    expect(msg).toContain('tolerability lead flag');
  });

  it('singular vs plural medication formatting', () => {
    const refs = Array.from({ length: 4 }, (_, i) => refusal({ daysAgo: i, medicationId: 'medA' }));
    const r = computeRefusalTrend(refs, { asOf: NOW, minRecentRefusals: 2 });
    const msg = summarizeRefusalTrend(r);
    expect(msg).toContain('1 medication.');
  });
});

describe('end-to-end story', () => {
  it('captures the canonical "tolerability problem brewing" case', () => {
    // Patient takes 60 doses/month of statin. Historically refused
    // ~1/month for non-tolerability reasons. Past 10 days: 3 nausea
    // refusals.
    const refs = [
      // Historical noise
      refusal({ daysAgo: 50, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'sleeping' }),
      refusal({ daysAgo: 80, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'travelling' }),
      refusal({ daysAgo: 120, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'declined' }),
      refusal({ daysAgo: 150, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'sleeping' }),
      // Recent cluster
      refusal({ daysAgo: 2, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'nausea' }),
      refusal({ daysAgo: 5, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'nausea' }),
      refusal({ daysAgo: 9, medicationId: 'statin', medicationName: 'Atorvastatin', reason: 'nausea' }),
    ];
    const r = computeRefusalTrend(refs, { asOf: NOW });
    const m = r.perMedication[0]!;
    // Overall density is rising (3/30 = 0.10 vs 7/180 = 0.039)
    expect(m.direction).toBe('rising');
    // Tolerability lead flag MUST trip — this is the actionable signal
    expect(m.risingTolerability).toBe(true);
    expect(m.message).toContain('nausea');
  });
});
