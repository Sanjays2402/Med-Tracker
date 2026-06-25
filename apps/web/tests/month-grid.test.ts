import { describe, it, expect } from 'vitest';
import {
  buildMonthGrid,
  prevMonth,
  nextMonth,
  doseCountsForGrid,
  type RecurrenceLike,
} from '../lib/month-grid';

describe('buildMonthGrid', () => {
  it('always produces 42 cells', () => {
    expect(buildMonthGrid(2026, 5).cells).toHaveLength(42); // June 2026
  });

  it('starts on the Sunday on or before the 1st', () => {
    // June 1 2026 is a Monday -> grid starts Sunday May 31 2026.
    const g = buildMonthGrid(2026, 5);
    expect(g.cells[0]!.weekday).toBe(0);
    expect(g.cells[0]!.key).toBe('2026-05-31');
    expect(g.cells[0]!.inMonth).toBe(false);
  });

  it('marks in-month vs spill days', () => {
    const g = buildMonthGrid(2026, 5);
    const june1 = g.cells.find((c) => c.key === '2026-06-01')!;
    expect(june1.inMonth).toBe(true);
    expect(june1.day).toBe(1);
    const inMonthCount = g.cells.filter((c) => c.inMonth).length;
    expect(inMonthCount).toBe(30); // June has 30 days
  });

  it('flags today', () => {
    const today = new Date(2026, 5, 25);
    const g = buildMonthGrid(2026, 5, today);
    const todays = g.cells.filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]!.key).toBe('2026-06-25');
  });

  it('labels the month', () => {
    expect(buildMonthGrid(2026, 5).label).toBe('June 2026');
    expect(buildMonthGrid(2026, 0).label).toBe('January 2026');
  });

  it('handles February in a non-leap year (28 in-month days)', () => {
    const g = buildMonthGrid(2026, 1); // Feb 2026
    expect(g.cells.filter((c) => c.inMonth).length).toBe(28);
  });
});

describe('prevMonth / nextMonth', () => {
  it('rolls back across the year boundary', () => {
    expect(prevMonth(2026, 0)).toEqual({ year: 2025, month: 11 });
  });
  it('rolls forward across the year boundary', () => {
    expect(nextMonth(2026, 11)).toEqual({ year: 2027, month: 0 });
  });
  it('steps within a year', () => {
    expect(prevMonth(2026, 5)).toEqual({ year: 2026, month: 4 });
    expect(nextMonth(2026, 5)).toEqual({ year: 2026, month: 6 });
  });
});

describe('doseCountsForGrid', () => {
  const grid = buildMonthGrid(2026, 5, new Date(2026, 5, 25)); // June 2026

  it('counts every-day recurrences on each cell', () => {
    const recs: RecurrenceLike[] = [{ times: ['08:00', '20:00'] }];
    const counts = doseCountsForGrid(grid, recs);
    // Every one of the 42 cells gets 2 doses.
    expect(Object.keys(counts)).toHaveLength(42);
    expect(counts['2026-06-15']).toBe(2);
  });

  it('limits weekly recurrences to their weekdays', () => {
    // Mondays only, one time.
    const recs: RecurrenceLike[] = [{ times: ['08:00'], daysOfWeek: [1] }];
    const counts = doseCountsForGrid(grid, recs);
    // June 2026 Mondays: 1, 8, 15, 22, 29 -> plus spill Monday(s).
    expect(counts['2026-06-01']).toBe(1);
    expect(counts['2026-06-08']).toBe(1);
    expect(counts['2026-06-02']).toBeUndefined(); // Tuesday
  });

  it('sums multiple recurrences on the same day', () => {
    const recs: RecurrenceLike[] = [
      { times: ['08:00'] },
      { times: ['12:00', '20:00'], daysOfWeek: [1] }, // Mondays add 2
    ];
    const counts = doseCountsForGrid(grid, recs);
    expect(counts['2026-06-01']).toBe(3); // Monday: 1 + 2
    expect(counts['2026-06-02']).toBe(1); // Tuesday: 1
  });

  it('respects an endDate (no doses after it)', () => {
    const recs: RecurrenceLike[] = [
      { times: ['08:00'], endDate: '2026-06-10T00:00:00Z' },
    ];
    const counts = doseCountsForGrid(grid, recs);
    expect(counts['2026-06-10']).toBe(1);
    expect(counts['2026-06-11']).toBeUndefined();
  });

  it('respects a startDate (no doses before it)', () => {
    const recs: RecurrenceLike[] = [
      { times: ['08:00'], startDate: '2026-06-20T00:00:00Z' },
    ];
    const counts = doseCountsForGrid(grid, recs);
    expect(counts['2026-06-19']).toBeUndefined();
    expect(counts['2026-06-20']).toBe(1);
  });
});
