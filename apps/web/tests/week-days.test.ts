import { describe, it, expect } from 'vitest';
import {
  startOfWeek,
  isSameLocalDay,
  buildWeekModel,
} from '../lib/week-days';

// Wednesday, 2026-06-24 (local).
const WED = new Date(2026, 5, 24, 15, 0, 0).getTime();

describe('startOfWeek', () => {
  it('rolls back to the preceding Sunday at local midnight', () => {
    const s = startOfWeek(WED);
    expect(s.getDay()).toBe(0); // Sunday
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getDate()).toBe(21); // Sun 2026-06-21
  });
  it('returns the same day when already Sunday', () => {
    const sun = new Date(2026, 5, 21, 9, 0, 0).getTime();
    expect(startOfWeek(sun).getDate()).toBe(21);
  });
});

describe('isSameLocalDay', () => {
  it('is true across different clock times on the same day', () => {
    const a = new Date(2026, 5, 24, 1, 0).getTime();
    const b = new Date(2026, 5, 24, 23, 0).getTime();
    expect(isSameLocalDay(a, b)).toBe(true);
  });
  it('is false across day boundaries', () => {
    const a = new Date(2026, 5, 24, 23, 0).getTime();
    const b = new Date(2026, 5, 25, 1, 0).getTime();
    expect(isSameLocalDay(a, b)).toBe(false);
  });
});

describe('buildWeekModel', () => {
  it('returns seven cells starting on the week start', () => {
    const m = buildWeekModel(startOfWeek(WED), WED);
    expect(m.cells).toHaveLength(7);
    expect(m.cells[0]!.weekday).toBe(0); // Sunday
    expect(m.cells[6]!.weekday).toBe(6); // Saturday
    expect(m.cells.map((c) => c.dayOfMonth)).toEqual([21, 22, 23, 24, 25, 26, 27]);
  });

  it('marks today at the correct column', () => {
    const m = buildWeekModel(startOfWeek(WED), WED);
    expect(m.todayIndex).toBe(3); // Wed is index 3
    expect(m.containsToday).toBe(true);
    expect(m.cells[3]!.isToday).toBe(true);
    expect(m.cells.filter((c) => c.isToday)).toHaveLength(1);
  });

  it('reports no today column when the week does not contain now', () => {
    const nextWeekStart = startOfWeek(WED);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const m = buildWeekModel(nextWeekStart, WED);
    expect(m.todayIndex).toBe(-1);
    expect(m.containsToday).toBe(false);
    expect(m.cells.every((c) => !c.isToday)).toBe(true);
  });

  it('normalises the week start to local midnight', () => {
    const noonStart = new Date(2026, 5, 21, 12, 30, 0);
    const m = buildWeekModel(noonStart, WED);
    expect(m.start.getHours()).toBe(0);
    expect(m.start.getMinutes()).toBe(0);
  });

  it('handles a month-boundary week', () => {
    // Week containing Tue 2026-06-30 starts Sun 2026-06-28.
    const tue = new Date(2026, 5, 30, 10, 0, 0).getTime();
    const m = buildWeekModel(startOfWeek(tue), tue);
    expect(m.cells.map((c) => c.dayOfMonth)).toEqual([28, 29, 30, 1, 2, 3, 4]);
    expect(m.todayIndex).toBe(2);
  });
});
