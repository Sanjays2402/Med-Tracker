import { describe, it, expect } from 'vitest';
import {
  DEFAULT_JUMP_HORIZON,
  findNextDayWithDoses,
  nextDayWithDoses,
  jumpLabel,
} from '../lib/day-jump';
import { relativeDayLabel } from '../lib/day-step';
import type { DayScheduleLike } from '../lib/day-doses';

// A med dosed only on Mondays (weekday 1). 2026-06-15 is a Monday.
const mondayOnly: DayScheduleLike = {
  medicationId: 'm1',
  medicationName: 'Levo',
  times: ['08:00'],
  daysOfWeek: [1],
};

// A med dosed every day.
const daily: DayScheduleLike = {
  medicationId: 'm2',
  medicationName: 'Metformin',
  times: ['08:00', '20:00'],
};

describe('DEFAULT_JUMP_HORIZON', () => {
  it('is two weeks', () => {
    expect(DEFAULT_JUMP_HORIZON).toBe(14);
  });
});

describe('findNextDayWithDoses (forward)', () => {
  it('finds the next dosed day, skipping empties', () => {
    // From Tue 2026-06-16, the next Monday is 2026-06-22 (6 days out).
    const r = findNextDayWithDoses('2026-06-16', [mondayOnly], 1);
    expect(r.dayKey).toBe('2026-06-22');
    expect(r.distance).toBe(6);
    expect(r.doseCount).toBe(1);
  });
  it('excludes the start day itself', () => {
    // Start ON a Monday; it must look PAST it to the next Monday.
    const r = findNextDayWithDoses('2026-06-15', [mondayOnly], 1);
    expect(r.dayKey).toBe('2026-06-22');
    expect(r.distance).toBe(7);
  });
  it('finds the very next day when a daily med is present', () => {
    const r = nextDayWithDoses('2026-06-16', [daily]);
    expect(r.dayKey).toBe('2026-06-17');
    expect(r.distance).toBe(1);
    expect(r.doseCount).toBe(2);
  });
  it('returns a null result when nothing falls in the horizon', () => {
    // Monday-only, but horizon of 3 days from a Tuesday never reaches Monday.
    const r = findNextDayWithDoses('2026-06-16', [mondayOnly], 1, 3);
    expect(r.dayKey).toBeNull();
    expect(r.doseCount).toBe(0);
  });
  it('returns null for an empty recurrence set', () => {
    expect(findNextDayWithDoses('2026-06-16', [], 1).dayKey).toBeNull();
  });
  it('never scans past the horizon (bounded loop)', () => {
    // A med dosed only on the 1st of a far month; default horizon won't reach it.
    const farMed: DayScheduleLike = {
      medicationId: 'm3',
      medicationName: 'Rare',
      times: ['08:00'],
      startDate: '2027-01-01',
      endDate: '2027-01-01',
    };
    expect(findNextDayWithDoses('2026-06-16', [farMed], 1).dayKey).toBeNull();
  });
});

describe('findNextDayWithDoses (backward)', () => {
  it('finds the previous dosed day', () => {
    // From Wed 2026-06-17 backward, the prior Monday is 2026-06-15 (2 days back).
    const r = findNextDayWithDoses('2026-06-17', [mondayOnly], -1);
    expect(r.dayKey).toBe('2026-06-15');
    expect(r.distance).toBe(-2);
  });
});

describe('jumpLabel', () => {
  const rel = (k: string) => relativeDayLabel(k, '2026-06-16');
  it('returns null when there is nothing to jump to', () => {
    expect(jumpLabel({ dayKey: null, distance: 0, doseCount: 0 }, rel)).toBeNull();
  });
  it('uses "Jump to Tomorrow" for the +1 case', () => {
    expect(jumpLabel({ dayKey: '2026-06-17', distance: 1, doseCount: 2 }, rel)).toBe('Jump to Tomorrow');
  });
  it('folds longer forward jumps into "Jump ahead N days"', () => {
    expect(jumpLabel({ dayKey: '2026-06-22', distance: 6, doseCount: 1 }, rel)).toBe('Jump ahead 6 days');
  });
  it('folds backward jumps into "Jump back N days"', () => {
    expect(jumpLabel({ dayKey: '2026-06-13', distance: -3, doseCount: 1 }, rel)).toBe('Jump back 3 days');
  });
});
