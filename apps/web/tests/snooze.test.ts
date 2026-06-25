import { describe, it, expect } from 'vitest';
import { snoozeUntil, snoozeLabel, SNOOZE_OPTIONS, type SnoozeChoice } from '../lib/snooze';

// A fixed reference: Thursday, June 25 2026, 14:00 local.
const THURS_2PM = new Date(2026, 5, 25, 14, 0, 0, 0).getTime();
// A late reference: same day 20:00 (past the 18:00 evening mark).
const THURS_8PM = new Date(2026, 5, 25, 20, 0, 0, 0).getTime();
// A Monday reference: June 22 2026, 10:00 local.
const MON_10AM = new Date(2026, 5, 22, 10, 0, 0, 0).getTime();

function hrsBetween(a: number, b: number): number {
  return (b - a) / 3_600_000;
}

describe('snoozeUntil — relative', () => {
  it('1h adds exactly one hour', () => {
    expect(snoozeUntil('1h', THURS_2PM)).toBe(THURS_2PM + 3_600_000);
  });
  it('3h adds exactly three hours', () => {
    expect(snoozeUntil('3h', THURS_2PM)).toBe(THURS_2PM + 3 * 3_600_000);
  });
});

describe('snoozeUntil — evening', () => {
  it('lands on 18:00 today when it is still afternoon', () => {
    const d = new Date(snoozeUntil('evening', THURS_2PM));
    expect(d.getHours()).toBe(18);
    expect(d.getDate()).toBe(25);
  });
  it('rolls to tomorrow evening when already past 18:00', () => {
    const d = new Date(snoozeUntil('evening', THURS_8PM));
    expect(d.getHours()).toBe(18);
    expect(d.getDate()).toBe(26);
  });
});

describe('snoozeUntil — tomorrow', () => {
  it('is the next calendar day at 09:00', () => {
    const d = new Date(snoozeUntil('tomorrow', THURS_2PM));
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });
  it('always moves forward', () => {
    expect(snoozeUntil('tomorrow', THURS_2PM)).toBeGreaterThan(THURS_2PM);
  });
});

describe('snoozeUntil — monday', () => {
  it('jumps to the next Monday at 09:00 from a Thursday', () => {
    const d = new Date(snoozeUntil('monday', THURS_2PM));
    expect(d.getDay()).toBe(1); // Monday
    expect(d.getDate()).toBe(29); // June 29 2026 is the next Monday
    expect(d.getHours()).toBe(9);
  });
  it('jumps a FULL week when today is already Monday', () => {
    const d = new Date(snoozeUntil('monday', MON_10AM));
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(29); // not June 22 again
    expect(hrsBetween(MON_10AM, d.getTime())).toBeGreaterThan(24);
  });
});

describe('snooze ordering', () => {
  it('every option produces a strictly future time', () => {
    const choices: SnoozeChoice[] = SNOOZE_OPTIONS.map((o) => o.choice);
    for (const c of choices) {
      expect(snoozeUntil(c, THURS_2PM)).toBeGreaterThan(THURS_2PM);
    }
  });
});

describe('snoozeLabel', () => {
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  it('labels relative choices without a clock time', () => {
    expect(snoozeLabel('1h', THURS_2PM, fmt)).toBe('in 1 hour');
    expect(snoozeLabel('3h', THURS_2PM, fmt)).toBe('in 3 hours');
  });
  it('labels named choices with the resurface time', () => {
    expect(snoozeLabel('tomorrow', THURS_2PM, fmt)).toBe('tomorrow, 9:00');
    expect(snoozeLabel('evening', THURS_2PM, fmt)).toBe('this evening, 18:00');
    expect(snoozeLabel('monday', THURS_2PM, fmt)).toBe('Monday, 9:00');
  });
});

describe('SNOOZE_OPTIONS', () => {
  it('exposes five labelled options', () => {
    expect(SNOOZE_OPTIONS).toHaveLength(5);
    expect(SNOOZE_OPTIONS.every((o) => o.label.length > 0)).toBe(true);
  });
});
