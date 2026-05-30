import { describe, it, expect } from 'vitest';
import { pendingDoses, dueNow, planUpcomingReminders } from '../src/services/ReminderEngine';

describe('ReminderEngine', () => {
  it('returns no pending doses for empty input', () => {
    expect(pendingDoses([], [])).toEqual([]);
  });
  it('dueNow respects lead minutes', () => {
    const now = new Date('2025-01-01T08:00:00Z');
    const items = [
      { medicationId: 'm', scheduleId: 's', dueAt: new Date('2025-01-01T08:03:00Z') },
      { medicationId: 'm', scheduleId: 's', dueAt: new Date('2025-01-01T10:00:00Z') },
    ];
    expect(dueNow(items, now, 5)).toHaveLength(1);
  });

  it('planUpcomingReminders defers items inside quiet hours', () => {
    const now = new Date('2026-05-29T12:00:00');
    const planned = planUpcomingReminders(
      [{ medicationId: 'm', scheduleId: 's', dueAt: new Date('2026-05-30T03:00:00') }],
      { now, leadMinutes: 5, quiet: { start: '22:00', end: '07:00' } },
    );
    expect(planned[0]!.deferred).toBe(true);
    expect(planned[0]!.fireAt.toISOString()).toBe(new Date('2026-05-30T07:00:00').toISOString());
  });

  it('planUpcomingReminders without quiet hours fires at lead', () => {
    const now = new Date('2026-05-29T12:00:00');
    const planned = planUpcomingReminders(
      [{ medicationId: 'm', scheduleId: 's', dueAt: new Date('2026-05-29T12:10:00') }],
      { now, leadMinutes: 5 },
    );
    expect(planned[0]!.deferred).toBe(false);
    expect(planned[0]!.fireAt.toISOString()).toBe(new Date('2026-05-29T12:05:00').toISOString());
  });
});
