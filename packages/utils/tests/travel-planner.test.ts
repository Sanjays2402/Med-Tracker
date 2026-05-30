import { describe, it, expect } from 'vitest';
import { planTravelSchedule } from '../src/travel-planner';

describe('planTravelSchedule', () => {
  it('returns empty plan when no home times provided', () => {
    const p = planTravelSchedule({
      homeZone: 'America/Los_Angeles',
      targetZone: 'Europe/London',
      departAt: '2026-06-01T15:00:00Z',
      returnAt: '2026-06-08T15:00:00Z',
      homeTimes: [],
      intervalHours: 12,
    });
    expect(p.doses).toEqual([]);
    expect(p.summary).toMatch(/no dose times/i);
  });

  it('returns empty plan when return precedes departure', () => {
    const p = planTravelSchedule({
      homeZone: 'America/Los_Angeles',
      targetZone: 'Europe/London',
      departAt: '2026-06-08T15:00:00Z',
      returnAt: '2026-06-01T15:00:00Z',
      homeTimes: ['08:00', '20:00'],
      intervalHours: 12,
    });
    expect(p.doses).toEqual([]);
    expect(p.summary).toMatch(/return must be after/i);
  });

  it('detects an eastbound positive offset delta for LA to London', () => {
    const p = planTravelSchedule({
      homeZone: 'America/Los_Angeles',
      targetZone: 'Europe/London',
      departAt: '2026-06-01T15:00:00Z',
      returnAt: '2026-06-08T15:00:00Z',
      homeTimes: ['08:00', '20:00'],
      intervalHours: 12,
    });
    expect(p.offsetDeltaHours).toBeGreaterThan(0);
    expect(p.outboundShiftDays).toBeGreaterThan(0);
    expect(p.inboundShiftDays).toBeGreaterThan(0);
    expect(p.doses.length).toBeGreaterThan(0);
  });

  it('detects a westbound negative offset for NY to LA', () => {
    const p = planTravelSchedule({
      homeZone: 'America/New_York',
      targetZone: 'America/Los_Angeles',
      departAt: '2026-06-01T15:00:00Z',
      returnAt: '2026-06-05T15:00:00Z',
      homeTimes: ['09:00', '21:00'],
      intervalHours: 12,
      maxShiftPerDayHours: 1,
    });
    expect(p.offsetDeltaHours).toBeLessThan(0);
    expect(p.outboundShiftDays).toBeGreaterThanOrEqual(2);
  });

  it('produces inter-dose intervals close to the target interval after shift', () => {
    const p = planTravelSchedule({
      homeZone: 'America/Los_Angeles',
      targetZone: 'Europe/London',
      departAt: '2026-06-01T15:00:00Z',
      returnAt: '2026-06-12T15:00:00Z',
      homeTimes: ['08:00', '20:00'],
      intervalHours: 12,
      toleranceHours: 3,
      maxShiftPerDayHours: 2,
    });
    // Steady-state doses (destination-steady) should all have intervals near 12h.
    const steady = p.doses.filter((d) => d.leg === 'destination-steady');
    expect(steady.length).toBeGreaterThan(2);
    for (let i = 1; i < steady.length; i++) {
      expect(Math.abs(steady[i]!.intervalFromPrev! - 12)).toBeLessThanOrEqual(3);
    }
  });

  it('produces doses in strictly increasing UTC order', () => {
    const p = planTravelSchedule({
      homeZone: 'America/Los_Angeles',
      targetZone: 'Asia/Tokyo',
      departAt: '2026-06-01T15:00:00Z',
      returnAt: '2026-06-09T15:00:00Z',
      homeTimes: ['08:00', '20:00'],
      intervalHours: 12,
      maxShiftPerDayHours: 2,
    });
    for (let i = 1; i < p.doses.length; i++) {
      expect(p.doses[i]!.takeAt > p.doses[i - 1]!.takeAt).toBe(true);
    }
  });

  it('labels legs in expected sequence: outbound then steady then inbound', () => {
    const p = planTravelSchedule({
      homeZone: 'America/Los_Angeles',
      targetZone: 'Europe/London',
      departAt: '2026-06-01T15:00:00Z',
      returnAt: '2026-06-15T15:00:00Z',
      homeTimes: ['08:00', '20:00'],
      intervalHours: 12,
      maxShiftPerDayHours: 2,
    });
    const legs = p.doses.map((d) => d.leg);
    const firstSteady = legs.indexOf('destination-steady');
    const firstInbound = legs.indexOf('inbound-shift');
    expect(firstSteady).toBeGreaterThan(0);
    expect(firstInbound).toBeGreaterThan(firstSteady);
    expect(legs.slice(0, firstSteady).every((l) => l === 'outbound-shift')).toBe(true);
  });
});
