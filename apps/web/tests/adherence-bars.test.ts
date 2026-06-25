import { describe, it, expect } from 'vitest';
import {
  adherencePct,
  adherenceTone,
  buildAdherenceBars,
  ADHERENCE_THRESHOLDS,
  type MedAdherenceInput,
} from '../lib/adherence-bars';

describe('adherencePct', () => {
  it('computes rounded integer percent', () => {
    expect(adherencePct(9, 10)).toBe(90);
    expect(adherencePct(2, 3)).toBe(67);
    expect(adherencePct(1, 3)).toBe(33);
  });
  it('returns 0 when nothing was scheduled', () => {
    expect(adherencePct(0, 0)).toBe(0);
    expect(adherencePct(5, 0)).toBe(0);
  });
  it('clamps into 0..100', () => {
    expect(adherencePct(11, 10)).toBe(100);
    expect(adherencePct(-3, 10)).toBe(0);
  });
});

describe('adherenceTone', () => {
  it('flags danger below 70', () => {
    expect(adherenceTone(0)).toBe('danger');
    expect(adherenceTone(69)).toBe('danger');
  });
  it('flags warn in [70, 90)', () => {
    expect(adherenceTone(70)).toBe('warn');
    expect(adherenceTone(89)).toBe('warn');
  });
  it('is ok at or above 90', () => {
    expect(adherenceTone(90)).toBe('ok');
    expect(adherenceTone(100)).toBe('ok');
  });
  it('uses the documented thresholds', () => {
    expect(ADHERENCE_THRESHOLDS).toEqual({ danger: 70, warn: 90 });
  });
});

describe('buildAdherenceBars', () => {
  const rows: MedAdherenceInput[] = [
    { medicationId: 'm_good', medicationName: 'Lisinopril', taken: 28, scheduled: 30 }, // 93 ok
    { medicationId: 'm_mid', medicationName: 'Metformin', taken: 24, scheduled: 30 },   // 80 warn
    { medicationId: 'm_bad', medicationName: 'Atorvastatin', taken: 12, scheduled: 30 },// 40 danger
    { medicationId: 'm_none', medicationName: 'PRN Ibuprofen', taken: 0, scheduled: 0 },// empty
  ];

  it('sorts worst adherence first, empties last', () => {
    const { bars } = buildAdherenceBars(rows);
    expect(bars.map((b) => b.medicationId)).toEqual(['m_bad', 'm_mid', 'm_good', 'm_none']);
  });

  it('assigns tones from the ramp', () => {
    const { bars } = buildAdherenceBars(rows);
    const byId = Object.fromEntries(bars.map((b) => [b.medicationId, b.tone]));
    expect(byId.m_bad).toBe('danger');
    expect(byId.m_mid).toBe('warn');
    expect(byId.m_good).toBe('ok');
  });

  it('marks zero-scheduled rows as empty with zero width', () => {
    const { bars } = buildAdherenceBars(rows);
    const none = bars.find((b) => b.medicationId === 'm_none')!;
    expect(none.empty).toBe(true);
    expect(none.width).toBe(0);
    expect(none.pct).toBe(0);
  });

  it('gives non-empty bars a minimum visible width', () => {
    const allMissed: MedAdherenceInput[] = [{ medicationId: 'z', medicationName: 'Z', taken: 0, scheduled: 30 }];
    const { bars } = buildAdherenceBars(allMissed);
    expect(bars[0]!.pct).toBe(0);
    expect(bars[0]!.width).toBeGreaterThanOrEqual(2);
  });

  it('width tracks pct for normal bars', () => {
    const { bars } = buildAdherenceBars(rows);
    expect(bars.find((b) => b.medicationId === 'm_mid')!.width).toBe(80);
  });

  it('computes the weighted overall percent', () => {
    // taken 28+24+12+0 = 64, scheduled 30*3 = 90 -> 71
    const { overallPct } = buildAdherenceBars(rows);
    expect(overallPct).toBe(71);
  });

  it('reports the single worst non-empty bar', () => {
    const { worst } = buildAdherenceBars(rows);
    expect(worst?.medicationId).toBe('m_bad');
  });

  it('counts meds flagged below the danger threshold', () => {
    const { flaggedCount } = buildAdherenceBars(rows);
    expect(flaggedCount).toBe(1);
  });

  it('breaks ties by name A-Z', () => {
    const tied: MedAdherenceInput[] = [
      { medicationId: 'b', medicationName: 'Beta', taken: 5, scheduled: 10 },
      { medicationId: 'a', medicationName: 'Alpha', taken: 5, scheduled: 10 },
    ];
    expect(buildAdherenceBars(tied).bars.map((x) => x.medicationId)).toEqual(['a', 'b']);
  });

  it('handles an empty input', () => {
    const r = buildAdherenceBars([]);
    expect(r.bars).toEqual([]);
    expect(r.overallPct).toBe(0);
    expect(r.worst).toBeNull();
    expect(r.flaggedCount).toBe(0);
  });
});
