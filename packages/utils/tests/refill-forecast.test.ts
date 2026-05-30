import { describe, it, expect } from 'vitest';
import { forecastRefill, forecastMany, dailyUsageFromSchedules } from '../src/refill-forecast';
import type { Schedule } from '@med/types';

function sched(over: Partial<Schedule>): Schedule {
  return {
    id: over.id ?? 's',
    medicationId: over.medicationId ?? 'm',
    kind: over.kind ?? 'daily',
    times: over.times ?? ['08:00'],
    daysOfWeek: over.daysOfWeek,
    intervalHours: over.intervalHours,
    cronExpression: over.cronExpression,
    startsAt: over.startsAt ?? '2026-01-01T00:00:00.000Z',
    endsAt: over.endsAt,
    enabled: over.enabled ?? true,
  } as Schedule;
}

const NOW = new Date('2026-05-29T12:00:00.000Z');

describe('refill-forecast', () => {
  it('marks an empty supply as out', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 0,
      schedules: [sched({ times: ['08:00'] })],
    }, NOW);
    expect(f.status).toBe('out');
    expect(f.daysOfSupply).toBe(0);
  });

  it('returns ok with infinite days for as-needed only', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 30,
      schedules: [sched({ kind: 'asNeeded', times: [] })],
    }, NOW);
    expect(f.status).toBe('ok');
    expect(f.daysOfSupply).toBe(Infinity);
    expect(f.runOutDate).toBeNull();
  });

  it('computes daily usage for once daily', () => {
    const u = dailyUsageFromSchedules([sched({ times: ['08:00'] })], NOW, 14, 1);
    expect(u).toBeCloseTo(1, 2);
  });

  it('computes daily usage for twice daily with 2 units each', () => {
    const u = dailyUsageFromSchedules([sched({ times: ['08:00', '20:00'] })], NOW, 14, 2);
    expect(u).toBeCloseTo(4, 2);
  });

  it('flags urgent at low supply', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 4,
      schedules: [sched({ times: ['08:00'] })],
    }, NOW);
    expect(f.status).toBe('urgent');
    expect(f.daysOfSupply).toBe(4);
    expect(f.refillByDate).toBeTruthy();
  });

  it('flags soon between urgent and soon thresholds', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 10,
      schedules: [sched({ times: ['08:00'] })],
    }, NOW);
    expect(f.status).toBe('soon');
  });

  it('flags ok for well-stocked supply', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 60,
      schedules: [sched({ times: ['08:00'] })],
    }, NOW);
    expect(f.status).toBe('ok');
    expect(f.daysOfSupply).toBe(60);
  });

  it('handles weekly schedule (lower daily rate)', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 4,
      schedules: [sched({ kind: 'weekly', times: ['08:00'], daysOfWeek: [1] })],
    }, NOW);
    // 1/7 dose per day, 4 units supply, ~28 days
    expect(f.daysOfSupply).toBeGreaterThanOrEqual(20);
    expect(f.status).toBe('ok');
  });

  it('ignores disabled schedules', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 10,
      schedules: [sched({ enabled: false, times: ['08:00'] })],
    }, NOW);
    expect(f.dailyUsage).toBe(0);
    expect(f.status).toBe('ok');
  });

  it('forecastMany sorts by severity then days', () => {
    const list = forecastMany([
      { medicationId: 'a', supplyRemaining: 60, schedules: [sched({ times: ['08:00'] })] },
      { medicationId: 'b', supplyRemaining: 2, schedules: [sched({ times: ['08:00'] })] },
      { medicationId: 'c', supplyRemaining: 0, schedules: [sched({ times: ['08:00'] })] },
      { medicationId: 'd', supplyRemaining: 10, schedules: [sched({ times: ['08:00'] })] },
    ], NOW);
    expect(list.map((x) => x.medicationId)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('refillByDate is never in the past', () => {
    const f = forecastRefill({
      medicationId: 'm', supplyRemaining: 1,
      schedules: [sched({ times: ['08:00'] })],
    }, NOW);
    expect(new Date(f.refillByDate!).getTime()).toBeGreaterThanOrEqual(new Date('2026-05-29T00:00:00.000Z').getTime());
  });
});
