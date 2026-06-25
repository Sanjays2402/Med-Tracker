import { describe, it, expect } from 'vitest';
import {
  buildSupplySparkline,
  supplyTone,
} from '../lib/supply-sparkline';
import type { Medication } from '../lib/types';

describe('supplyTone', () => {
  it('flags danger at or below the refill threshold', () => {
    expect(supplyTone(7, 7)).toBe('danger');
    expect(supplyTone(3, 7)).toBe('danger');
    expect(supplyTone(3, 3)).toBe('danger');
  });
  it('flags warn within 2x the threshold', () => {
    expect(supplyTone(10, 7)).toBe('warn');
    expect(supplyTone(14, 7)).toBe('warn');
  });
  it('is ok beyond 2x the threshold', () => {
    expect(supplyTone(15, 7)).toBe('ok');
    expect(supplyTone(100, 14)).toBe('ok');
  });
  it('defaults the threshold to 7 days when not provided', () => {
    expect(supplyTone(7)).toBe('danger');
    expect(supplyTone(8)).toBe('warn');
    expect(supplyTone(15)).toBe('ok');
  });
  it('treats a zero/negative threshold as the default 7', () => {
    expect(supplyTone(7, 0)).toBe('danger');
    expect(supplyTone(7, -3)).toBe('danger');
  });
});

describe('buildSupplySparkline', () => {
  const med: Medication = {
    id: 'm', name: 'Metformin', remainingDoses: 42, schedule: '08:00, 20:00 daily', refillThresholdDays: 10,
  };

  it('returns null when remaining doses are unknown or non-positive', () => {
    expect(buildSupplySparkline({ id: 'x', name: 'X' })).toBeNull();
    expect(buildSupplySparkline({ id: 'x', name: 'X', remainingDoses: 0 })).toBeNull();
    expect(buildSupplySparkline({ id: 'x', name: 'X', remainingDoses: -5 })).toBeNull();
  });

  it('computes days left as ceil(remaining / dosesPerDay)', () => {
    // 42 doses, 2/day -> 21 days
    expect(buildSupplySparkline(med)!.daysLeft).toBe(21);
    // 9 doses, 3/day -> 3 days
    const amox: Medication = { id: 'a', name: 'Amox', remainingDoses: 9, schedule: '08:00, 14:00, 20:00' };
    expect(buildSupplySparkline(amox)!.daysLeft).toBe(3);
    // 5 doses, 2/day -> ceil(2.5) = 3 days
    const odd: Medication = { id: 'o', name: 'Odd', remainingDoses: 5, schedule: '08:00, 20:00' };
    expect(buildSupplySparkline(odd)!.daysLeft).toBe(3);
  });

  it('parses one dose per day from a single-time schedule', () => {
    const liso: Medication = { id: 'l', name: 'Lisinopril', remainingDoses: 18, schedule: '08:00 daily' };
    const s = buildSupplySparkline(liso)!;
    expect(s.perDay).toBe(1);
    expect(s.daysLeft).toBe(18);
  });

  it('produces horizon+1 points starting full at top-left', () => {
    const s = buildSupplySparkline(med, { horizonDays: 30, width: 100, height: 20 })!;
    expect(s.points).toHaveLength(31);
    expect(s.points[0]).toMatchObject({ day: 0, doses: 42, x: 0, y: 0 });
    // last day of horizon
    expect(s.points[30]!.x).toBe(100);
  });

  it('clamps supply at zero once the bottle empties', () => {
    const s = buildSupplySparkline(med, { horizonDays: 30 })!;
    // day 21 onward should be 0 doses, y at the baseline (height)
    const afterRunout = s.points.filter((p) => p.day >= 21);
    expect(afterRunout.every((p) => p.doses === 0)).toBe(true);
    expect(afterRunout.every((p) => p.y === s.height)).toBe(true);
  });

  it('flags runsOutInWindow only when run-out is within the horizon', () => {
    // 21 days left, 30-day window -> runs out in window
    expect(buildSupplySparkline(med, { horizonDays: 30 })!.runsOutInWindow).toBe(true);
    // 21 days left, 14-day window -> does not run out in window
    expect(buildSupplySparkline(med, { horizonDays: 14 })!.runsOutInWindow).toBe(false);
  });

  it('places the run-out crossing proportionally on the x-axis', () => {
    const s = buildSupplySparkline(med, { horizonDays: 30, width: 30 })!;
    // 21 / 30 * 30 = 21
    expect(s.runoutX).toBe(21);
  });

  it('clamps the run-out crossing to the window edge when beyond horizon', () => {
    const s = buildSupplySparkline(med, { horizonDays: 14, width: 14 })!;
    // min(21, 14) / 14 * 14 = 14 (the right edge)
    expect(s.runoutX).toBe(14);
  });

  it('derives tone from days left and the med refill threshold', () => {
    // 21 days, threshold 10 -> ok (21 > 2x10)
    expect(buildSupplySparkline(med)!.tone).toBe('ok');
    // 18 days, threshold 10 -> warn (<= 20, > 10)
    const warnMed: Medication = { id: 'w', name: 'Warn', remainingDoses: 18, schedule: '08:00 daily', refillThresholdDays: 10 };
    expect(buildSupplySparkline(warnMed)!.tone).toBe('warn');
    // plenty of supply -> ok
    const vitd: Medication = { id: 'v', name: 'VitD', remainingDoses: 84, schedule: '08:00 daily', refillThresholdDays: 14 };
    expect(buildSupplySparkline(vitd)!.tone).toBe('ok');
    // nearly empty -> danger
    const ator: Medication = { id: 'a', name: 'Atorvastatin', remainingDoses: 6, schedule: '22:00 daily', refillThresholdDays: 7 };
    expect(buildSupplySparkline(ator)!.tone).toBe('danger');
  });

  it('emits a polyline string and a closed area path', () => {
    const s = buildSupplySparkline(med, { horizonDays: 4, width: 40, height: 10 })!;
    expect(s.polyline.split(' ')).toHaveLength(5); // 5 points
    expect(s.polyline.startsWith('0,0')).toBe(true);
    expect(s.areaPath.startsWith('M 0,0')).toBe(true);
    expect(s.areaPath.endsWith('Z')).toBe(true);
  });
});
