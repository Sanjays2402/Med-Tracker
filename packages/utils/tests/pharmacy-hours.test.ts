import { describe, it, expect } from 'vitest';
import {
  resolvePharmacyOpen,
  pharmaciesOpenNow,
  type PharmacyHours,
} from '../src/pharmacy-hours';

const REGULAR: PharmacyHours = {
  weekly: {
    1: { open: '09:00', close: '21:00' }, // Mon
    2: { open: '09:00', close: '21:00' },
    3: { open: '09:00', close: '21:00' },
    4: { open: '09:00', close: '21:00' },
    5: { open: '09:00', close: '21:00' },
    6: { open: '10:00', close: '18:00' }, // Sat
    // Sunday closed (undefined)
  },
};

const SPLIT_SHIFT: PharmacyHours = {
  weekly: {
    1: [
      { open: '08:00', close: '12:00' },
      { open: '14:00', close: '18:00' },
    ],
  },
};

const WITH_HOLIDAY: PharmacyHours = {
  ...REGULAR,
  overrides: {
    // Wed 2026-12-25 forced closed (Christmas).
    '2026-12-25': null,
    // Thu 2026-12-24 short day (8-14).
    '2026-12-24': [{ open: '08:00', close: '14:00' }],
  },
};

describe('resolvePharmacyOpen', () => {
  it('returns open with nextClose when inside hours', () => {
    // 2026-06-22 is Monday, 12:00 local.
    const out = resolvePharmacyOpen({ hours: REGULAR, at: new Date('2026-06-22T12:00:00') });
    expect(out.isOpen).toBe(true);
    expect(out.nextClose).toBe(new Date('2026-06-22T21:00:00').toISOString());
  });

  it('returns closed with nextOpen same day when before opening', () => {
    const out = resolvePharmacyOpen({ hours: REGULAR, at: new Date('2026-06-22T07:00:00') });
    expect(out.isOpen).toBe(false);
    expect(out.nextOpen).toBe(new Date('2026-06-22T09:00:00').toISOString());
  });

  it('returns closed with nextOpen next day after closing', () => {
    const out = resolvePharmacyOpen({ hours: REGULAR, at: new Date('2026-06-22T22:00:00') });
    expect(out.isOpen).toBe(false);
    expect(out.nextOpen).toBe(new Date('2026-06-23T09:00:00').toISOString());
  });

  it('skips closed Sundays', () => {
    // 2026-06-21 is Sunday; nextOpen jumps to Monday 09:00.
    const out = resolvePharmacyOpen({ hours: REGULAR, at: new Date('2026-06-21T12:00:00') });
    expect(out.isOpen).toBe(false);
    expect(out.nextOpen).toBe(new Date('2026-06-22T09:00:00').toISOString());
  });

  it('honors holiday closure override', () => {
    // 2026-12-25 is Friday but explicitly closed.
    const out = resolvePharmacyOpen({
      hours: WITH_HOLIDAY,
      at: new Date('2026-12-25T12:00:00'),
    });
    expect(out.isOpen).toBe(false);
    // 2026-12-26 is Saturday, opens 10:00.
    expect(out.nextOpen).toBe(new Date('2026-12-26T10:00:00').toISOString());
  });

  it('honors shortened holiday hours', () => {
    // 2026-12-24 short day 8-14; at 13:00 still open, closes 14:00.
    const out = resolvePharmacyOpen({
      hours: WITH_HOLIDAY,
      at: new Date('2026-12-24T13:00:00'),
    });
    expect(out.isOpen).toBe(true);
    expect(out.nextClose).toBe(new Date('2026-12-24T14:00:00').toISOString());
  });

  it('handles split shifts (closed for lunch)', () => {
    // Monday 13:00, between 12-14 lunch break.
    const out = resolvePharmacyOpen({
      hours: SPLIT_SHIFT,
      at: new Date('2026-06-22T13:00:00'),
    });
    expect(out.isOpen).toBe(false);
    expect(out.nextOpen).toBe(new Date('2026-06-22T14:00:00').toISOString());
  });

  it('reports 24-hour pharmacy as always open', () => {
    const out = resolvePharmacyOpen({
      hours: { always: true },
      at: new Date('2026-12-25T03:00:00'),
    });
    expect(out.isOpen).toBe(true);
    expect(out.nextClose).toBeUndefined();
    expect(out.reason).toMatch(/24-hour/);
  });

  it('returns no-opening when horizon exhausted', () => {
    const out = resolvePharmacyOpen({
      hours: { weekly: {} },
      at: new Date('2026-06-22T12:00:00'),
      horizonDays: 3,
    });
    expect(out.isOpen).toBe(false);
    expect(out.nextOpen).toBeUndefined();
  });
});

describe('pharmaciesOpenNow', () => {
  it('keeps only currently-open pharmacies ranked by closing time', () => {
    const a = { id: 'a', hours: REGULAR };
    const b = { id: 'b', hours: { weekly: { 1: { open: '10:00', close: '19:00' } } } as PharmacyHours };
    const c = { id: 'c', hours: { weekly: { 1: { open: '06:00', close: '09:30' } } } as PharmacyHours };
    const out = pharmaciesOpenNow([a, b, c], new Date('2026-06-22T12:00:00'));
    expect(out.map((p) => p.id)).toEqual(['b', 'a']);
    expect(out[0]!.closesAt).toBe(new Date('2026-06-22T19:00:00').toISOString());
  });
});
