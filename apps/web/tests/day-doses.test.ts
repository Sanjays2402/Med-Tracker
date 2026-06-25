import { describe, it, expect } from 'vitest';
import {
  dosesForDay,
  weekdayOf,
  timeToMinutes,
  partOfDay,
  groupByPartOfDay,
  PART_OF_DAY_LABEL,
  type DayScheduleLike,
} from '../lib/day-doses';

const schedules: DayScheduleLike[] = [
  { medicationId: 'm_l', medicationName: 'Lisinopril', times: ['08:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
  { medicationId: 'm_m', medicationName: 'Metformin', times: ['08:00', '20:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6], notes: 'With meals' },
  { medicationId: 'm_a', medicationName: 'Atorvastatin', times: ['22:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
  // Mondays-only vitamin
  { medicationId: 'm_v', medicationName: 'Vitamin D3', times: ['09:00'], daysOfWeek: [1] },
];

describe('weekdayOf', () => {
  it('returns the local weekday for a YYYY-MM-DD key', () => {
    // 2026-06-25 is a Thursday (4)
    expect(weekdayOf('2026-06-25')).toBe(4);
    // 2026-06-22 is a Monday (1)
    expect(weekdayOf('2026-06-22')).toBe(1);
  });
  it('ignores a trailing time portion', () => {
    expect(weekdayOf('2026-06-22T12:00:00Z')).toBe(1);
  });
});

describe('timeToMinutes', () => {
  it('parses HH:mm to minutes since midnight', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('20:30')).toBe(1230);
    expect(timeToMinutes('00:00')).toBe(0);
  });
  it('sorts unparseable times last', () => {
    expect(timeToMinutes('whenever')).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('clamps out-of-range components', () => {
    expect(timeToMinutes('25:99')).toBe(23 * 60 + 59);
  });
});

describe('partOfDay', () => {
  it('buckets by hour', () => {
    expect(partOfDay(timeToMinutes('08:00'))).toBe('morning');
    expect(partOfDay(timeToMinutes('14:00'))).toBe('afternoon');
    expect(partOfDay(timeToMinutes('22:00'))).toBe('evening');
  });
  it('boundaries: noon is afternoon, 17:00 is evening', () => {
    expect(partOfDay(12 * 60)).toBe('afternoon');
    expect(partOfDay(17 * 60)).toBe('evening');
  });
});

describe('dosesForDay', () => {
  it('expands a weekday (Thursday) ignoring Monday-only meds', () => {
    const day = dosesForDay('2026-06-25', schedules); // Thursday
    expect(day.total).toBe(4); // Lisinopril, Metformin x2, Atorvastatin
    expect(day.medicationCount).toBe(3);
    expect(day.doses.map((d) => d.medicationName)).not.toContain('Vitamin D3');
  });

  it('includes the Monday-only med on a Monday', () => {
    const day = dosesForDay('2026-06-22', schedules); // Monday
    expect(day.doses.some((d) => d.medicationName === 'Vitamin D3')).toBe(true);
    expect(day.total).toBe(5);
  });

  it('sorts doses by time of day', () => {
    const day = dosesForDay('2026-06-25', schedules);
    expect(day.doses.map((d) => d.time)).toEqual(['08:00', '08:00', '20:00', '22:00']);
  });

  it('breaks same-time ties by medication name', () => {
    const day = dosesForDay('2026-06-25', schedules);
    // two 08:00 doses: Lisinopril before Metformin (alpha)
    const eights = day.doses.filter((d) => d.time === '08:00');
    expect(eights.map((d) => d.medicationName)).toEqual(['Lisinopril', 'Metformin']);
  });

  it('reports first and last dose times', () => {
    const day = dosesForDay('2026-06-25', schedules);
    expect(day.firstTime).toBe('08:00');
    expect(day.lastTime).toBe('22:00');
  });

  it('carries notes onto dose rows', () => {
    const day = dosesForDay('2026-06-25', schedules);
    const metformin = day.doses.find((d) => d.medicationName === 'Metformin');
    expect(metformin?.notes).toBe('With meals');
  });

  it('respects start/end date ranges', () => {
    const course: DayScheduleLike[] = [
      { medicationId: 'm_c', medicationName: 'Amoxicillin', times: ['08:00'], startDate: '2026-06-20', endDate: '2026-06-24' },
    ];
    expect(dosesForDay('2026-06-22', course).total).toBe(1);
    expect(dosesForDay('2026-06-25', course).total).toBe(0); // past end
    expect(dosesForDay('2026-06-19', course).total).toBe(0); // before start
  });

  it('returns an empty summary when nothing lands that day', () => {
    const day = dosesForDay('2026-06-23', [{ medicationId: 'x', medicationName: 'X', times: ['08:00'], daysOfWeek: [0] }]);
    expect(day.total).toBe(0);
    expect(day.medicationCount).toBe(0);
    expect(day.firstTime).toBeNull();
    expect(day.lastTime).toBeNull();
  });

  it('treats empty daysOfWeek as every day', () => {
    const daily: DayScheduleLike[] = [{ medicationId: 'd', medicationName: 'Daily', times: ['08:00'], daysOfWeek: [] }];
    expect(dosesForDay('2026-06-25', daily).total).toBe(1);
  });
});

describe('groupByPartOfDay', () => {
  it('groups in morning/afternoon/evening order, dropping empties', () => {
    const day = dosesForDay('2026-06-25', schedules);
    const groups = groupByPartOfDay(day.doses);
    expect(groups.map((g) => g.part)).toEqual(['morning', 'evening']); // no afternoon dose Thursday
    expect(groups[0]!.doses).toHaveLength(2); // two 08:00
    expect(groups[1]!.doses.map((d) => d.time)).toEqual(['20:00', '22:00']);
  });
  it('exposes friendly labels', () => {
    expect(PART_OF_DAY_LABEL.morning).toBe('Morning');
    expect(PART_OF_DAY_LABEL.afternoon).toBe('Afternoon');
    expect(PART_OF_DAY_LABEL.evening).toBe('Evening');
  });
});
