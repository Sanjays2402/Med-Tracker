import { describe, it, expect } from 'vitest';
import {
  expandScheduleInZone,
  dateFor,
  utcOffsetMinutes,
  zonedYMD,
} from '../src/schedule-timezone';

const dailySchedule = {
  id: 's1',
  medicationId: 'm1',
  kind: 'daily' as const,
  times: ['08:00', '20:00'],
  startsAt: '2026-01-01T00:00:00.000Z',
  enabled: true,
};

describe('utcOffsetMinutes', () => {
  it('returns negative offset for Los Angeles in winter (PST = UTC-8)', () => {
    expect(utcOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/Los_Angeles')).toBe(-480);
  });
  it('returns negative offset for Los Angeles in summer (PDT = UTC-7)', () => {
    expect(utcOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'America/Los_Angeles')).toBe(-420);
  });
  it('returns zero for UTC', () => {
    expect(utcOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'UTC')).toBe(0);
  });
  it('handles half-hour zones (Asia/Kolkata = UTC+5:30)', () => {
    expect(utcOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
  });
});

describe('zonedYMD', () => {
  it('returns date as it appears in the target zone', () => {
    // 2026-01-01T02:00Z is still 2025-12-31 in Los Angeles.
    expect(zonedYMD(new Date('2026-01-01T02:00:00Z'), 'America/Los_Angeles')).toEqual({
      y: 2025,
      m: 12,
      d: 31,
    });
  });
});

describe('dateFor', () => {
  it('resolves wall time to UTC in a fixed-offset zone', () => {
    // 08:00 in LA winter (UTC-8) is 16:00 UTC.
    const utc = dateFor({ y: 2026, m: 1, d: 15 }, '08:00', 'America/Los_Angeles');
    expect(utc.toISOString()).toBe('2026-01-15T16:00:00.000Z');
  });
  it('respects DST: 08:00 LA summer is 15:00 UTC', () => {
    const utc = dateFor({ y: 2026, m: 7, d: 15 }, '08:00', 'America/Los_Angeles');
    expect(utc.toISOString()).toBe('2026-07-15T15:00:00.000Z');
  });
  it('respects half-hour zones', () => {
    // 09:30 in Kolkata is 04:00 UTC.
    const utc = dateFor({ y: 2026, m: 1, d: 15 }, '09:30', 'Asia/Kolkata');
    expect(utc.toISOString()).toBe('2026-01-15T04:00:00.000Z');
  });
});

describe('expandScheduleInZone', () => {
  it('produces fixed wall-clock times across a DST transition (US spring forward 2026-03-08)', () => {
    // March 7 (PST) and March 9 (PDT) should both have an 08:00 local dose.
    const from = new Date('2026-03-07T00:00:00Z');
    const to = new Date('2026-03-10T00:00:00Z');
    const doses = expandScheduleInZone(dailySchedule, { timeZone: 'America/Los_Angeles', from, to });
    // 4 calendar days x 2 times = up to 8 doses; window may clip some.
    const labels = doses.map((d) => d.toISOString());
    // March 7 08:00 PST = 16:00 UTC; March 9 08:00 PDT = 15:00 UTC.
    expect(labels).toContain('2026-03-07T16:00:00.000Z');
    expect(labels).toContain('2026-03-09T15:00:00.000Z');
    // 20:00 local same days
    expect(labels).toContain('2026-03-07T04:00:00.000Z'); // 20:00 PST = 04:00 UTC next day, but this is on Mar 7's iteration; actually 20:00 PST of Mar 7 = 04:00 UTC Mar 8
  });

  it('emits no doses for an asNeeded schedule', () => {
    const doses = expandScheduleInZone(
      { ...dailySchedule, kind: 'asNeeded', times: [] },
      { timeZone: 'UTC', from: new Date('2026-01-01Z'), to: new Date('2026-01-07Z') },
    );
    expect(doses).toEqual([]);
  });

  it('emits no doses when schedule is disabled', () => {
    const doses = expandScheduleInZone(
      { ...dailySchedule, enabled: false },
      { timeZone: 'UTC', from: new Date('2026-01-01Z'), to: new Date('2026-01-07Z') },
    );
    expect(doses).toEqual([]);
  });

  it('honors weekly daysOfWeek in the target zone', () => {
    const sched = { ...dailySchedule, kind: 'weekly' as const, times: ['10:00'], daysOfWeek: [1, 3, 5] };
    const doses = expandScheduleInZone(sched, {
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-01-05T00:00:00Z'), // Mon
      to: new Date('2026-01-11T23:59:59Z'), // Sun
    });
    expect(doses).toHaveLength(3); // Mon, Wed, Fri only
  });

  it('expands interval schedules anchored at local midnight', () => {
    const sched = { ...dailySchedule, kind: 'interval' as const, intervalHours: 6, times: [] };
    const doses = expandScheduleInZone(sched, {
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-01-15T08:00:00Z'), // 00:00 PST on Jan 15
      to: new Date('2026-01-16T07:59:59Z'),
    });
    // 4 doses per day: 00,06,12,18 local
    expect(doses).toHaveLength(4);
  });

  it('returns results sorted chronologically', () => {
    const doses = expandScheduleInZone(dailySchedule, {
      timeZone: 'America/Los_Angeles',
      from: new Date('2026-01-01T00:00:00Z'),
      to: new Date('2026-01-03T23:59:59Z'),
    });
    for (let i = 1; i < doses.length; i++) {
      expect(doses[i - 1]!.getTime()).toBeLessThan(doses[i]!.getTime());
    }
  });
});
