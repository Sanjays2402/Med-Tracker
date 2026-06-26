import { describe, it, expect } from 'vitest';
import {
  parseDayKey,
  formatDayKey,
  stepDay,
  nextDay,
  prevDay,
  daysBetween,
  isSameDay,
  todayKey,
  relativeDayLabel,
  dayStepView,
} from '../lib/day-step';

describe('parseDayKey', () => {
  it('parses a clean YYYY-MM-DD', () => {
    expect(parseDayKey('2026-06-25')).toEqual({ y: 2026, m: 6, d: 25 });
  });
  it('ignores a trailing time portion', () => {
    expect(parseDayKey('2026-06-25T08:30:00Z')).toEqual({ y: 2026, m: 6, d: 25 });
  });
  it('rejects garbage and out-of-range months/days', () => {
    expect(parseDayKey('nope')).toBeNull();
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('2026-00-10')).toBeNull();
    expect(parseDayKey('2026-06-00')).toBeNull();
  });
});

describe('formatDayKey', () => {
  it('zero-pads month and day', () => {
    expect(formatDayKey({ y: 2026, m: 6, d: 5 })).toBe('2026-06-05');
    expect(formatDayKey({ y: 2026, m: 12, d: 31 })).toBe('2026-12-31');
  });
});

describe('stepDay', () => {
  it('adds and subtracts within a month', () => {
    expect(stepDay('2026-06-10', 5)).toBe('2026-06-15');
    expect(stepDay('2026-06-10', -3)).toBe('2026-06-07');
    expect(stepDay('2026-06-10', 0)).toBe('2026-06-10');
  });
  it('rolls over a month boundary forward', () => {
    expect(stepDay('2026-06-30', 1)).toBe('2026-07-01');
  });
  it('rolls over a month boundary backward', () => {
    expect(stepDay('2026-07-01', -1)).toBe('2026-06-30');
  });
  it('rolls over a year boundary', () => {
    expect(stepDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(stepDay('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('handles leap-year February correctly', () => {
    // 2028 is a leap year: Feb has 29 days.
    expect(stepDay('2028-02-28', 1)).toBe('2028-02-29');
    expect(stepDay('2028-02-29', 1)).toBe('2028-03-01');
    // 2027 is not: Feb 28 -> Mar 1.
    expect(stepDay('2027-02-28', 1)).toBe('2027-03-01');
  });
  it('steps by large deltas', () => {
    expect(stepDay('2026-06-01', 30)).toBe('2026-07-01');
    expect(stepDay('2026-06-01', 365)).toBe('2027-06-01');
  });
  it('truncates fractional deltas', () => {
    expect(stepDay('2026-06-10', 1.9)).toBe('2026-06-11');
  });
  it('returns an unparseable key unchanged', () => {
    expect(stepDay('not-a-date', 1)).toBe('not-a-date');
  });
});

describe('nextDay / prevDay', () => {
  it('are single-step shortcuts', () => {
    expect(nextDay('2026-06-25')).toBe('2026-06-26');
    expect(prevDay('2026-06-25')).toBe('2026-06-24');
  });
  it('round-trip back to the original', () => {
    expect(prevDay(nextDay('2026-02-28'))).toBe('2026-02-28');
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-06-10', '2026-06-15')).toBe(5);
    expect(daysBetween('2026-06-15', '2026-06-10')).toBe(-5);
    expect(daysBetween('2026-06-10', '2026-06-10')).toBe(0);
  });
  it('spans month and year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // leap year
  });
  it('returns 0 for unparseable input', () => {
    expect(daysBetween('x', '2026-06-10')).toBe(0);
  });
});

describe('isSameDay', () => {
  it('matches identical days regardless of time suffix', () => {
    expect(isSameDay('2026-06-25', '2026-06-25T23:00:00Z')).toBe(true);
  });
  it('distinguishes different days', () => {
    expect(isSameDay('2026-06-25', '2026-06-26')).toBe(false);
  });
});

describe('todayKey', () => {
  it('formats a local date', () => {
    expect(todayKey(new Date(2026, 5, 5))).toBe('2026-06-05');
  });
});

describe('relativeDayLabel', () => {
  const today = '2026-06-25';
  it('labels today / tomorrow / yesterday', () => {
    expect(relativeDayLabel('2026-06-25', today)).toBe('Today');
    expect(relativeDayLabel('2026-06-26', today)).toBe('Tomorrow');
    expect(relativeDayLabel('2026-06-24', today)).toBe('Yesterday');
  });
  it('labels further days with a count', () => {
    expect(relativeDayLabel('2026-06-28', today)).toBe('In 3 days');
    expect(relativeDayLabel('2026-06-20', today)).toBe('5 days ago');
  });
});

describe('dayStepView', () => {
  it('bundles neighbours + today metadata', () => {
    const v = dayStepView('2026-06-25', '2026-06-25');
    expect(v).toEqual({
      dayKey: '2026-06-25',
      prevKey: '2026-06-24',
      nextKey: '2026-06-26',
      isToday: true,
      relativeLabel: 'Today',
    });
  });
  it('flags a non-today day', () => {
    const v = dayStepView('2026-06-30', '2026-06-25');
    expect(v.isToday).toBe(false);
    expect(v.relativeLabel).toBe('In 5 days');
    expect(v.prevKey).toBe('2026-06-29');
    expect(v.nextKey).toBe('2026-07-01');
  });
});
