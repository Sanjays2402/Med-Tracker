import { describe, it, expect } from 'vitest';
import { RefillService } from '../src/services/RefillService';
import type { Schedule } from '@med/types';

const s = (over: Partial<Schedule>): Schedule => ({
  id: 's', medicationId: 'm', kind: 'daily', times: ['08:00'],
  startsAt: '2026-01-01T00:00:00.000Z', enabled: true, ...over,
}) as Schedule;

const NOW = new Date('2026-05-29T12:00:00.000Z');

describe('RefillService', () => {
  it('forecast returns a single forecast', () => {
    const svc = new RefillService();
    const f = svc.forecast({ medicationId: 'm', supplyRemaining: 30, schedules: [s({})] }, NOW);
    expect(f.medicationId).toBe('m');
    expect(f.status).toBe('ok');
  });

  it('forecastAll ranks by severity', () => {
    const svc = new RefillService();
    const out = svc.forecastAll([
      { medicationId: 'ok', supplyRemaining: 60, schedules: [s({})] },
      { medicationId: 'urgent', supplyRemaining: 2, schedules: [s({})] },
    ], NOW);
    expect(out[0]!.medicationId).toBe('urgent');
  });

  it('needsAttention drops ok entries', () => {
    const svc = new RefillService();
    const out = svc.needsAttention([
      { medicationId: 'ok', supplyRemaining: 60, schedules: [s({})] },
      { medicationId: 'soon', supplyRemaining: 10, schedules: [s({})] },
    ], NOW);
    expect(out.map((x) => x.medicationId)).toEqual(['soon']);
  });

  it('honors custom thresholds', () => {
    const svc = new RefillService({ urgentThresholdDays: 14, soonThresholdDays: 30 });
    const f = svc.forecast({ medicationId: 'm', supplyRemaining: 10, schedules: [s({})] }, NOW);
    expect(f.status).toBe('urgent');
  });
});
