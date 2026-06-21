import { describe, it, expect } from 'vitest';
import type { Schedule, Medication } from '@med/types';
import {
  summarizePillBurden,
  parseStrength,
  classifyBurden,
  timeBucketFor,
  type PillBurdenInput,
} from '../src/pill-burden';

function med(
  id: string,
  name: string,
  form: Medication['form'],
  strength: string,
): PillBurdenInput['medication'] {
  return { id, name, form, strength };
}

function dailySchedule(times: string[]): Schedule {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    medicationId: '00000000-0000-0000-0000-000000000002',
    kind: 'daily',
    times,
    startsAt: '2026-01-01T00:00:00Z',
    enabled: true,
  } as Schedule;
}

function weeklySchedule(times: string[], days: number[]): Schedule {
  return {
    ...dailySchedule(times),
    kind: 'weekly',
    daysOfWeek: days,
  } as Schedule;
}

function intervalSchedule(hours: number): Schedule {
  return {
    ...dailySchedule([]),
    kind: 'interval',
    intervalHours: hours,
  } as Schedule;
}

describe('parseStrength', () => {
  it('parses common forms', () => {
    expect(parseStrength('500 mg')).toEqual({ value: 500, unit: 'mg' });
    expect(parseStrength('250mg')).toEqual({ value: 250, unit: 'mg' });
    expect(parseStrength('5 mL')).toEqual({ value: 5, unit: 'ml' });
    expect(parseStrength('0.5 g')).toEqual({ value: 0.5, unit: 'g' });
    expect(parseStrength('100 mcg')).toEqual({ value: 100, unit: 'mcg' });
  });

  it('returns null on unparseable strings', () => {
    expect(parseStrength('Combination')).toBeNull();
    expect(parseStrength('')).toBeNull();
  });
});

describe('timeBucketFor', () => {
  it('classifies HH:MM into buckets', () => {
    expect(timeBucketFor('07:00')).toBe('morning');
    expect(timeBucketFor('12:00')).toBe('midday');
    expect(timeBucketFor('18:00')).toBe('evening');
    expect(timeBucketFor('22:00')).toBe('bedtime');
  });
});

describe('summarizePillBurden', () => {
  it('returns zero burden for empty input', () => {
    const s = summarizePillBurden([]);
    expect(s.pillCount).toBe(0);
    expect(s.medicationCount).toBe(0);
    expect(s.message).toMatch(/0 pills per day/);
  });

  it('counts tablets correctly with BID', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Lisinopril', 'tablet', '10 mg'), schedules: [dailySchedule(['08:00', '20:00'])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.pillCount).toBe(2);
    expect(s.totalMg).toBe(20);
    expect(s.administrationsPerDay).toBe(2);
    expect(s.byTime.morning).toBe(1);
    expect(s.byTime.evening).toBe(1);
  });

  it('handles amountPerDose > 1', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Lithium', 'tablet', '300 mg'), schedules: [dailySchedule(['09:00'])], amountPerDose: 3 },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.pillCount).toBe(3);
    expect(s.totalMg).toBe(900);
  });

  it('aggregates across multiple medications', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Metformin', 'tablet', '500 mg'), schedules: [dailySchedule(['08:00', '20:00'])] },
      { medication: med('m2', 'Atorvastatin', 'tablet', '20 mg'), schedules: [dailySchedule(['20:00'])] },
      { medication: med('m3', 'Lisinopril', 'tablet', '10 mg'), schedules: [dailySchedule(['08:00'])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.pillCount).toBe(4);
    expect(s.medicationCount).toBe(3);
    expect(s.totalMg).toBe(500 + 500 + 20 + 10);
  });

  it('counts liquid mL', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Amoxicillin', 'liquid', '5 mL'), schedules: [dailySchedule(['08:00', '20:00'])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.liquidMl).toBe(10);
    expect(s.pillCount).toBe(0);
  });

  it('counts injections separately from pills', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Insulin', 'injection', '10 mg'), schedules: [dailySchedule(['08:00'])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.injectionCount).toBe(1);
    expect(s.pillCount).toBe(0);
    expect(s.totalMg).toBe(10);
  });

  it('weekly schedules fractionalize correctly', () => {
    // M-W-F at 09:00 -> 3 / 7 days -> ~0.43 pills/day.
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Methotrexate', 'tablet', '7.5 mg'), schedules: [weeklySchedule(['09:00'], [1, 3, 5])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.pillCount).toBeCloseTo(3 / 7, 2);
  });

  it('interval schedules expand to roughly 24/interval admins', () => {
    // q6h -> 4 admins/day.
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Acetaminophen', 'tablet', '500 mg'), schedules: [intervalSchedule(6)] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.pillCount).toBe(4);
    expect(s.administrationsPerDay).toBe(4);
  });

  it('respects parsedStrengthMg override for unparseable strengths', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Combo', 'tablet', 'See label'), schedules: [dailySchedule(['08:00'])], parsedStrengthMg: 250 },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.totalMg).toBe(250);
  });

  it('skips asNeeded schedules', () => {
    const sched: Schedule = { ...dailySchedule([]), kind: 'asNeeded', times: [] } as Schedule;
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Rescue inhaler', 'inhaler', '90 mcg'), schedules: [sched] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.medicationCount).toBe(0);
    expect(s.pillCount).toBe(0);
  });

  it('byMedication sorted by pieces desc', () => {
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'A', 'tablet', '10 mg'), schedules: [dailySchedule(['08:00'])] },
      { medication: med('m2', 'B', 'tablet', '20 mg'), schedules: [dailySchedule(['08:00', '20:00'])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.byMedication[0]!.medicationId).toBe('m2');
    expect(s.byMedication[1]!.medicationId).toBe('m1');
  });

  it('disabled schedules contribute nothing', () => {
    const sched: Schedule = { ...dailySchedule(['08:00']), enabled: false } as Schedule;
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'X', 'tablet', '10 mg'), schedules: [sched] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.pillCount).toBe(0);
  });

  it('converts mcg to mg', () => {
    // 100 mcg twice a day -> 0.2 mg.
    const inputs: PillBurdenInput[] = [
      { medication: med('m1', 'Levothyroxine', 'tablet', '100 mcg'), schedules: [dailySchedule(['08:00'])] },
    ];
    const s = summarizePillBurden(inputs);
    expect(s.totalMg).toBeCloseTo(0.1, 3);
  });
});

describe('classifyBurden', () => {
  it('returns normal for < 5 medications', () => {
    const inputs: PillBurdenInput[] = Array.from({ length: 4 }, (_, i) => ({
      medication: med(`m${i}`, `Med${i}`, 'tablet', '10 mg'),
      schedules: [dailySchedule(['08:00'])],
    }));
    expect(classifyBurden(summarizePillBurden(inputs))).toBe('normal');
  });

  it('returns polypharmacy at 5+', () => {
    const inputs: PillBurdenInput[] = Array.from({ length: 6 }, (_, i) => ({
      medication: med(`m${i}`, `Med${i}`, 'tablet', '10 mg'),
      schedules: [dailySchedule(['08:00'])],
    }));
    expect(classifyBurden(summarizePillBurden(inputs))).toBe('polypharmacy');
  });

  it('returns hyperpolypharmacy at 10+', () => {
    const inputs: PillBurdenInput[] = Array.from({ length: 11 }, (_, i) => ({
      medication: med(`m${i}`, `Med${i}`, 'tablet', '10 mg'),
      schedules: [dailySchedule(['08:00'])],
    }));
    expect(classifyBurden(summarizePillBurden(inputs))).toBe('hyperpolypharmacy');
  });
});
