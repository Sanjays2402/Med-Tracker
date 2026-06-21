import { describe, it, expect } from 'vitest';
import {
  batchNotifications,
  countSavedNotifications,
  type PendingReminder,
} from '../src/notification-batcher';

const r = (
  id: string,
  iso: string,
  name: string,
  extras: Partial<PendingReminder> = {},
): PendingReminder => ({
  id,
  fireAt: iso,
  medicationId: `med-${name.toLowerCase()}`,
  medicationName: name,
  ...extras,
});

describe('batchNotifications', () => {
  it('coalesces reminders within the default 10-minute window', () => {
    const out = batchNotifications([
      r('1', '2026-06-20T08:00:00Z', 'Metformin', { dose: '500 mg' }),
      r('2', '2026-06-20T08:03:00Z', 'Lisinopril', { dose: '10 mg' }),
      r('3', '2026-06-20T08:08:00Z', 'Atorvastatin', { dose: '20 mg' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.reminders).toHaveLength(3);
    expect(out[0]!.single).toBe(false);
    expect(out[0]!.title).toBe('3 doses due');
    expect(out[0]!.body).toContain('Metformin — 500 mg');
    expect(out[0]!.body).toContain('Atorvastatin — 20 mg');
  });

  it('splits into separate batches when gap exceeds window', () => {
    const out = batchNotifications(
      [
        r('1', '2026-06-20T08:00:00Z', 'A'),
        r('2', '2026-06-20T08:05:00Z', 'B'),
        // 20-minute gap.
        r('3', '2026-06-20T08:25:00Z', 'C'),
        r('4', '2026-06-20T08:27:00Z', 'D'),
      ],
      { windowMinutes: 10 },
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.reminders.map((x) => x.id)).toEqual(['1', '2']);
    expect(out[1]!.reminders.map((x) => x.id)).toEqual(['3', '4']);
  });

  it('emits single reminders with friendly title', () => {
    const out = batchNotifications([
      r('1', '2026-06-20T08:00:00Z', 'Metformin', { dose: '500 mg' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.single).toBe(true);
    expect(out[0]!.title).toBe('Take Metformin (500 mg)');
    expect(out[0]!.body).toBe('Time for your Metformin.');
  });

  it('never batches a critical reminder with others', () => {
    const out = batchNotifications([
      r('1', '2026-06-20T08:00:00Z', 'Metformin'),
      r('crit', '2026-06-20T08:02:00Z', 'Insulin', { priority: 'critical' }),
      r('3', '2026-06-20T08:04:00Z', 'Lisinopril'),
    ]);
    // Critical is on its own; the others should batch together.
    const ids = out.map((b) => b.reminders.map((r) => r.id));
    expect(ids).toContainEqual(['crit']);
    const others = ids.find((batch) => !batch.includes('crit'));
    expect(others?.sort()).toEqual(['1', '3']);
  });

  it('flags batch priority as the highest member', () => {
    const out = batchNotifications([
      r('1', '2026-06-20T08:00:00Z', 'A', { priority: 'low' }),
      r('2', '2026-06-20T08:02:00Z', 'B', { priority: 'normal' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.priority).toBe('normal');
  });

  it('respects maxPerBatch ceiling', () => {
    const out = batchNotifications(
      [
        r('1', '2026-06-20T08:00:00Z', 'A'),
        r('2', '2026-06-20T08:01:00Z', 'B'),
        r('3', '2026-06-20T08:02:00Z', 'C'),
        r('4', '2026-06-20T08:03:00Z', 'D'),
      ],
      { maxPerBatch: 2 },
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.reminders).toHaveLength(2);
    expect(out[1]!.reminders).toHaveLength(2);
  });

  it('excludes reminders inside quiet hours window', () => {
    // 22:00 - 07:00 quiet window.
    const out = batchNotifications(
      [
        r('1', '2026-06-20T21:30:00', 'Evening'),
        // 23:00 falls inside quiet hours.
        r('2', '2026-06-20T23:00:00', 'Skipped'),
        // 07:30 next morning, outside quiet hours.
        r('3', '2026-06-21T07:30:00', 'Morning'),
      ],
      { quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 } },
    );
    const allIds = out.flatMap((b) => b.reminders.map((r) => r.id));
    expect(allIds).toContain('1');
    expect(allIds).toContain('3');
    expect(allIds).not.toContain('2');
  });
});

describe('countSavedNotifications', () => {
  it('returns the reduction in count', () => {
    const reminders = [
      r('1', '2026-06-20T08:00:00Z', 'A'),
      r('2', '2026-06-20T08:01:00Z', 'B'),
      r('3', '2026-06-20T08:02:00Z', 'C'),
    ];
    const out = batchNotifications(reminders);
    expect(countSavedNotifications(reminders, out)).toBe(2);
  });

  it('returns 0 when nothing was batched', () => {
    const reminders = [r('1', '2026-06-20T08:00:00Z', 'A')];
    const out = batchNotifications(reminders);
    expect(countSavedNotifications(reminders, out)).toBe(0);
  });
});
