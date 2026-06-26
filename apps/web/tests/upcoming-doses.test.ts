import { describe, it, expect } from 'vitest';
import {
  upcomingDayLabel,
  projectUpcoming,
  formatUntil,
} from '../lib/upcoming-doses';
import type { DayScheduleLike } from '../lib/day-doses';

// Fixed "now": Wednesday, 2026-06-24 09:00 local.
const NOW = new Date(2026, 5, 24, 9, 0, 0).getTime();

const everyDay = (id: string, name: string, times: string[]): DayScheduleLike => ({
  medicationId: id,
  medicationName: name,
  times,
});

describe('upcomingDayLabel', () => {
  it('labels today and tomorrow', () => {
    expect(upcomingDayLabel('2026-06-24', 0)).toBe('Today');
    expect(upcomingDayLabel('2026-06-25', 1)).toBe('Tomorrow');
  });
  it('uses a weekday name within the coming week', () => {
    // 2026-06-26 is a Friday.
    expect(upcomingDayLabel('2026-06-26', 2)).toBe('Fri');
  });
  it('uses a short month-day for further-out days', () => {
    expect(upcomingDayLabel('2026-07-03', 9)).toBe('Jul 3');
  });
});

describe('projectUpcoming', () => {
  const meds: DayScheduleLike[] = [
    everyDay('m1', 'Lisinopril', ['08:00', '20:00']),
    everyDay('m2', 'Metformin', ['12:00']),
  ];

  it('drops doses earlier today than now', () => {
    const s = projectUpcoming(meds, NOW, 1);
    // now is 09:00; 08:00 Lisinopril already passed, 12:00 + 20:00 remain.
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]!.label).toBe('Today');
    expect(s.groups[0]!.doses.map((d) => d.time)).toEqual(['12:00', '20:00']);
  });

  it('keeps full days for future dates', () => {
    const s = projectUpcoming(meds, NOW, 2);
    const tomorrow = s.groups.find((g) => g.daysAhead === 1)!;
    expect(tomorrow.label).toBe('Tomorrow');
    // All three dose-times present tomorrow, time-sorted.
    expect(tomorrow.doses.map((d) => d.time)).toEqual(['08:00', '12:00', '20:00']);
  });

  it('groups soonest-day first and counts totals', () => {
    const s = projectUpcoming(meds, NOW, 3);
    expect(s.groups.map((g) => g.daysAhead)).toEqual([0, 1, 2]);
    // today 2 + tomorrow 3 + day-after 3 = 8
    expect(s.total).toBe(8);
    expect(s.activeDays).toBe(3);
  });

  it('reports the soonest upcoming dose as next', () => {
    const s = projectUpcoming(meds, NOW, 3);
    expect(s.next?.time).toBe('12:00');
    expect(s.next?.medicationName).toBe('Metformin');
    expect(s.next?.minutesUntil).toBe(3 * 60); // 09:00 -> 12:00
  });

  it('omits days with no doses', () => {
    const mondayOnly: DayScheduleLike[] = [
      { medicationId: 'm', medicationName: 'Weekly', times: ['10:00'], daysOfWeek: [1] },
    ];
    // From Wed 06-24, the next Monday is 06-29 (5 days ahead → weekday label).
    const s = projectUpcoming(mondayOnly, NOW, 7);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]!.daysAhead).toBe(5);
    expect(s.groups[0]!.label).toBe('Mon');
  });

  it('respects schedule end dates', () => {
    const ending: DayScheduleLike[] = [
      { medicationId: 'm', medicationName: 'Course', times: ['10:00'], endDate: '2026-06-25' },
    ];
    const s = projectUpcoming(ending, NOW, 7);
    // Today (10:00 still future) + tomorrow 06-25, then nothing.
    expect(s.groups.map((g) => g.daysAhead)).toEqual([0, 1]);
  });

  it('caps the horizon to a sane range', () => {
    const s = projectUpcoming(meds, NOW, 999);
    // 31-day cap; every day has doses, so 31 active days.
    expect(s.activeDays).toBe(31);
  });

  it('returns an empty summary when there are no recurrences', () => {
    const s = projectUpcoming([], NOW, 7);
    expect(s).toMatchObject({ total: 0, activeDays: 0, next: null });
    expect(s.groups).toEqual([]);
  });

  it('carries minutesUntil on each dose', () => {
    const s = projectUpcoming([everyDay('m', 'M', ['10:30'])], NOW, 1);
    // 09:00 -> 10:30 = 90 minutes.
    expect(s.groups[0]!.doses[0]!.minutesUntil).toBe(90);
  });
});

describe('formatUntil', () => {
  it('reads "now" at or before zero', () => {
    expect(formatUntil(0)).toBe('now');
    expect(formatUntil(-5)).toBe('now');
  });
  it('reads minutes under an hour', () => {
    expect(formatUntil(25)).toBe('in 25m');
  });
  it('reads whole and fractional hours', () => {
    expect(formatUntil(180)).toBe('in 3h');
    expect(formatUntil(190)).toBe('in 3h 10m');
  });
  it('reads days past 24h', () => {
    expect(formatUntil(24 * 60)).toBe('in 1 day');
    expect(formatUntil(48 * 60)).toBe('in 2 days');
  });
});
