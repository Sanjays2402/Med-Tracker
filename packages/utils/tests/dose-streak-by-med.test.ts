import { describe, it, expect } from 'vitest';
import {
  computeStreaksByMedication,
  topActiveStreak,
  streaksAtRisk,
  type MedicationDose,
} from '../src/dose-streak-by-med';

function at(day: number, hour = 8): string {
  const d = new Date(2026, 5, 20, hour, 0, 0, 0);
  d.setDate(d.getDate() + day);
  return d.toISOString();
}

function dose(medicationId: string, day: number, taken: boolean): MedicationDose {
  return {
    medicationId,
    dueAt: at(day),
    takenAt: taken ? at(day, 9) : null,
  };
}

describe('computeStreaksByMedication', () => {
  it('returns empty for empty input', () => {
    expect(computeStreaksByMedication([])).toEqual([]);
  });

  it('computes current and longest per medication', () => {
    // Med A: taken on days -2, -1, 0  -> current=3 longest=3
    // Med B: taken on days -5, -4, -2, -1, 0 -> longest=3 current=3
    const doses: MedicationDose[] = [
      dose('A', -2, true),
      dose('A', -1, true),
      dose('A', 0, true),
      dose('B', -5, true),
      dose('B', -4, true),
      dose('B', -3, false),
      dose('B', -2, true),
      dose('B', -1, true),
      dose('B', 0, true),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 18)) });
    expect(r).toHaveLength(2);
    const a = r.find((m) => m.medicationId === 'A')!;
    const b = r.find((m) => m.medicationId === 'B')!;
    expect(a.current).toBe(3);
    expect(a.longest).toBe(3);
    expect(b.current).toBe(3);
    expect(b.longest).toBe(3);
  });

  it('honors the grace window when today has no take but yesterday did', () => {
    const doses: MedicationDose[] = [
      dose('A', -3, true),
      dose('A', -2, true),
      dose('A', -1, true),
      dose('A', 0, false),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 6)) });
    // Today 06:00 < 24h grace -> walk back from yesterday.
    expect(r[0]!.current).toBe(3);
  });

  it('breaks the streak when grace window has expired', () => {
    const doses: MedicationDose[] = [
      dose('A', -3, true),
      dose('A', -2, true),
      dose('A', -1, true),
      dose('A', 0, false),
    ];
    // 12h grace; 18:00 is past the 12h window.
    const r = computeStreaksByMedication(doses, {
      now: new Date(at(0, 18)),
      graceHours: 12,
    });
    expect(r[0]!.current).toBe(0);
  });

  it('detects the longest run when there is a gap', () => {
    const doses: MedicationDose[] = [
      dose('A', -10, true),
      dose('A', -9, true),
      dose('A', -8, true),
      dose('A', -7, true),
      dose('A', -6, true),
      // gap
      dose('A', -2, true),
      dose('A', -1, true),
      dose('A', 0, true),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 12)) });
    expect(r[0]!.longest).toBe(5);
    expect(r[0]!.current).toBe(3);
    expect(r[0]!.longestRange).toBeDefined();
  });

  it('counts daysObserved as distinct scheduled days, taken or not', () => {
    const doses: MedicationDose[] = [
      dose('A', -3, false),
      dose('A', -2, true),
      dose('A', -1, false),
      dose('A', 0, true),
    ];
    const r = computeStreaksByMedication(doses);
    expect(r[0]!.daysObserved).toBe(4);
  });

  it('records lastTakenAt', () => {
    const doses: MedicationDose[] = [
      dose('A', -2, true),
      dose('A', -1, true),
      dose('A', 0, true),
    ];
    const r = computeStreaksByMedication(doses);
    expect(r[0]!.lastTakenAt).toBeDefined();
    expect(new Date(r[0]!.lastTakenAt!).getTime()).toBeGreaterThan(0);
  });

  it('sorts by current desc, then longest desc, then id', () => {
    const doses: MedicationDose[] = [
      // C: current 0 longest 5
      dose('C', -10, true), dose('C', -9, true), dose('C', -8, true),
      dose('C', -7, true), dose('C', -6, true),
      // A: current 3 longest 3
      dose('A', -2, true), dose('A', -1, true), dose('A', 0, true),
      // B: current 3 longest 5
      dose('B', -10, true), dose('B', -9, true), dose('B', -8, true),
      dose('B', -7, true), dose('B', -6, true),
      dose('B', -2, true), dose('B', -1, true), dose('B', 0, true),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 12)) });
    expect(r.map((m) => m.medicationId)).toEqual(['B', 'A', 'C']);
  });
});

describe('topActiveStreak', () => {
  it('returns undefined when empty', () => {
    expect(topActiveStreak([])).toBeUndefined();
  });

  it('returns the highest current streak', () => {
    const doses: MedicationDose[] = [
      dose('A', -2, true), dose('A', -1, true), dose('A', 0, true),
      dose('B', 0, true),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 12)) });
    expect(topActiveStreak(r)?.medicationId).toBe('A');
  });
});

describe('streaksAtRisk', () => {
  it('returns medications whose current is 0 but past longest >= threshold', () => {
    const doses: MedicationDose[] = [
      // A had a 7-day run two weeks ago, nothing since.
      dose('A', -20, true), dose('A', -19, true), dose('A', -18, true),
      dose('A', -17, true), dose('A', -16, true), dose('A', -15, true),
      dose('A', -14, true),
      // B has a 2-day run only.
      dose('B', -1, true), dose('B', 0, true),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 23)) });
    const risk = streaksAtRisk(r, 3);
    expect(risk.map((s) => s.medicationId)).toEqual(['A']);
  });

  it('respects custom minLongest', () => {
    const doses: MedicationDose[] = [
      dose('A', -5, true), dose('A', -4, true),
    ];
    const r = computeStreaksByMedication(doses, { now: new Date(at(0, 23)) });
    expect(streaksAtRisk(r, 5)).toHaveLength(0);
    expect(streaksAtRisk(r, 2)).toHaveLength(1);
  });
});
