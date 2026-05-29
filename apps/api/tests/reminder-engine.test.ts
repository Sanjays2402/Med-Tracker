import { describe, it, expect } from 'vitest';
import { pendingDoses, dueNow } from '../src/services/ReminderEngine';

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
});
