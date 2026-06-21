import { describe, it, expect } from 'vitest';
import {
  applyVacationOverrides,
  indexOverrides,
  isValidOverride,
  shiftFromTimezoneChange,
  type DoseInstance,
  type VacationOverride,
} from '../src/vacation-overrides';

function dose(medicationId: string, year: number, month: number, day: number, hour: number, minute = 0): DoseInstance {
  return {
    medicationId,
    dueAt: new Date(year, month, day, hour, minute, 0, 0),
  };
}

describe('applyVacationOverrides', () => {
  it('returns input unchanged when there are no overrides', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m1', 2026, 5, 20, 20),
    ];
    const r = applyVacationOverrides(doses, []);
    expect(r.doses).toHaveLength(2);
    expect(r.applied).toHaveLength(0);
  });

  it('shifts doses on the target date for a per-med override', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m1', 2026, 5, 21, 8),
    ];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', medicationId: 'm1', kind: 'shift', shiftMinutes: 180 },
    ];
    const r = applyVacationOverrides(doses, overrides);
    const onDay20 = r.doses.find((d) => d.dueAt.getDate() === 20);
    const onDay21 = r.doses.find((d) => d.dueAt.getDate() === 21);
    // Day 20 dose shifted from 08:00 to 11:00.
    expect(onDay20!.dueAt.getHours()).toBe(11);
    // Day 21 untouched.
    expect(onDay21!.dueAt.getHours()).toBe(8);
    expect(r.applied).toHaveLength(1);
  });

  it('applies a regimen-wide shift to all meds on the date', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m2', 2026, 5, 20, 9),
      dose('m1', 2026, 5, 21, 8),
    ];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', kind: 'shift', shiftMinutes: 60 },
    ];
    const r = applyVacationOverrides(doses, overrides);
    const day20 = r.doses.filter((d) => d.dueAt.getDate() === 20);
    expect(day20).toHaveLength(2);
    // m1 8->9, m2 9->10.
    const m1 = day20.find((d) => d.medicationId === 'm1');
    const m2 = day20.find((d) => d.medicationId === 'm2');
    expect(m1!.dueAt.getHours()).toBe(9);
    expect(m2!.dueAt.getHours()).toBe(10);
  });

  it('per-medication override beats regimen-wide for the same date', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m2', 2026, 5, 20, 9),
    ];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', kind: 'shift', shiftMinutes: 60 },
      { date: '2026-06-20', medicationId: 'm1', kind: 'shift', shiftMinutes: -60 },
    ];
    const r = applyVacationOverrides(doses, overrides);
    const m1 = r.doses.find((d) => d.medicationId === 'm1');
    const m2 = r.doses.find((d) => d.medicationId === 'm2');
    // m1: 08 - 1h = 07.
    expect(m1!.dueAt.getHours()).toBe(7);
    // m2: 09 + 1h = 10.
    expect(m2!.dueAt.getHours()).toBe(10);
  });

  it('replaceTimes drops original times and inserts fresh ones', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m1', 2026, 5, 20, 14),
      dose('m1', 2026, 5, 20, 20),
    ];
    const overrides: VacationOverride[] = [
      {
        date: '2026-06-20',
        medicationId: 'm1',
        kind: 'replaceTimes',
        replaceTimes: ['10:00', '22:00'],
      },
    ];
    const r = applyVacationOverrides(doses, overrides);
    const sortedHours = r.doses
      .filter((d) => d.dueAt.getDate() === 20)
      .map((d) => d.dueAt.getHours())
      .sort((a, b) => a - b);
    expect(sortedHours).toEqual([10, 22]);
  });

  it('skip removes every dose on that date for that medication', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m1', 2026, 5, 20, 20),
      dose('m1', 2026, 5, 21, 8),
    ];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', medicationId: 'm1', kind: 'skip', reason: 'colonoscopy prep' },
    ];
    const r = applyVacationOverrides(doses, overrides);
    expect(r.doses).toHaveLength(1);
    expect(r.doses[0]!.dueAt.getDate()).toBe(21);
    expect(r.applied).toHaveLength(2);
    expect(r.applied.every((a) => a.override?.kind === 'skip')).toBe(true);
  });

  it('does not touch doses outside the overridden date', () => {
    const doses = [
      dose('m1', 2026, 5, 19, 8),
      dose('m1', 2026, 5, 20, 8),
      dose('m1', 2026, 5, 21, 8),
    ];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', medicationId: 'm1', kind: 'shift', shiftMinutes: 240 },
    ];
    const r = applyVacationOverrides(doses, overrides);
    const day19 = r.doses.find((d) => d.dueAt.getDate() === 19)!;
    const day21 = r.doses.find((d) => d.dueAt.getDate() === 21)!;
    expect(day19.dueAt.getHours()).toBe(8);
    expect(day21.dueAt.getHours()).toBe(8);
  });

  it('returns sorted output regardless of input order', () => {
    const doses = [
      dose('m1', 2026, 5, 21, 8),
      dose('m1', 2026, 5, 20, 20),
      dose('m1', 2026, 5, 20, 8),
    ];
    const r = applyVacationOverrides(doses, []);
    for (let i = 1; i < r.doses.length; i++) {
      expect(r.doses[i]!.dueAt.getTime()).toBeGreaterThanOrEqual(r.doses[i - 1]!.dueAt.getTime());
    }
  });

  it('trimToWindow drops doses that shifted out of range', () => {
    const doses = [dose('m1', 2026, 5, 20, 22)];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', medicationId: 'm1', kind: 'shift', shiftMinutes: 180 }, // 22 -> 01 next day
    ];
    const r = applyVacationOverrides(doses, overrides, {
      trimToWindow: {
        from: new Date(2026, 5, 20, 0, 0),
        to: new Date(2026, 5, 20, 23, 59),
      },
    });
    expect(r.doses).toHaveLength(0);
    expect(r.applied).toHaveLength(1); // still recorded in audit
  });

  it('handles a regimen-wide skip', () => {
    const doses = [
      dose('m1', 2026, 5, 20, 8),
      dose('m2', 2026, 5, 20, 9),
      dose('m1', 2026, 5, 21, 8),
    ];
    const overrides: VacationOverride[] = [
      { date: '2026-06-20', kind: 'skip', reason: 'fasting day' },
    ];
    const r = applyVacationOverrides(doses, overrides);
    expect(r.doses).toHaveLength(1);
    expect(r.doses[0]!.dueAt.getDate()).toBe(21);
  });
});

describe('indexOverrides', () => {
  it('per-med entry overrides regimen-wide entry for the same date', () => {
    const map = indexOverrides([
      { date: '2026-06-20', kind: 'shift', shiftMinutes: 60 },
      { date: '2026-06-20', medicationId: 'm1', kind: 'shift', shiftMinutes: -60 },
    ]);
    expect(map.get('2026-06-20|*')!.shiftMinutes).toBe(60);
    expect(map.get('2026-06-20|m1')!.shiftMinutes).toBe(-60);
  });
});

describe('shiftFromTimezoneChange', () => {
  it('builds a +180 shift for PST->EST flight', () => {
    // PST = -480, EST = -300. Destination is 180 minutes ahead.
    const o = shiftFromTimezoneChange('2026-06-20', -480, -300);
    expect(o.kind).toBe('shift');
    expect(o.shiftMinutes).toBe(180);
    expect(o.reason).toMatch(/timezone/);
  });

  it('builds a -480 shift for west-bound long-haul', () => {
    // -300 -> -780 (e.g. EST to UTC-13 west)
    const o = shiftFromTimezoneChange('2026-06-20', -300, -780, 'm1', 'Cebu trip');
    expect(o.shiftMinutes).toBe(-480);
    expect(o.medicationId).toBe('m1');
    expect(o.reason).toBe('Cebu trip');
  });
});

describe('isValidOverride', () => {
  it('rejects malformed dates', () => {
    expect(isValidOverride({ date: '2026/06/20', kind: 'skip' })).toBe(false);
  });

  it('shift requires a numeric shiftMinutes', () => {
    expect(isValidOverride({ date: '2026-06-20', kind: 'shift' })).toBe(false);
    expect(isValidOverride({ date: '2026-06-20', kind: 'shift', shiftMinutes: 0 })).toBe(true);
  });

  it('replaceTimes requires a non-empty array of HH:MM', () => {
    expect(isValidOverride({ date: '2026-06-20', kind: 'replaceTimes' })).toBe(false);
    expect(isValidOverride({ date: '2026-06-20', kind: 'replaceTimes', replaceTimes: [] })).toBe(false);
    expect(isValidOverride({ date: '2026-06-20', kind: 'replaceTimes', replaceTimes: ['25:00'] })).toBe(false);
    expect(isValidOverride({ date: '2026-06-20', kind: 'replaceTimes', replaceTimes: ['08:00', '20:00'] })).toBe(true);
  });

  it('skip is always valid given a valid date', () => {
    expect(isValidOverride({ date: '2026-06-20', kind: 'skip' })).toBe(true);
  });
});
