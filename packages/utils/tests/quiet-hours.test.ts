import { describe, it, expect } from 'vitest';
import { isInQuietHours, deferToAllowedWindow, planReminders } from '../src/quiet-hours';

describe('quiet hours', () => {
  it('same-day window detects inside and outside', () => {
    const q = { start: '13:00', end: '15:00' };
    expect(isInQuietHours(new Date('2026-05-29T14:00:00'), q)).toBe(true);
    expect(isInQuietHours(new Date('2026-05-29T15:00:00'), q)).toBe(false);
    expect(isInQuietHours(new Date('2026-05-29T12:59:00'), q)).toBe(false);
  });

  it('overnight window detects pre-midnight and post-midnight', () => {
    const q = { start: '22:00', end: '07:00' };
    expect(isInQuietHours(new Date('2026-05-29T23:30:00'), q)).toBe(true);
    expect(isInQuietHours(new Date('2026-05-29T03:00:00'), q)).toBe(true);
    expect(isInQuietHours(new Date('2026-05-29T07:00:00'), q)).toBe(false);
    expect(isInQuietHours(new Date('2026-05-29T21:59:00'), q)).toBe(false);
  });

  it('start == end means no quiet hours', () => {
    expect(isInQuietHours(new Date('2026-05-29T03:00:00'), { start: '00:00', end: '00:00' })).toBe(false);
  });

  it('defers to end of same-day window', () => {
    const q = { start: '13:00', end: '15:00' };
    const out = deferToAllowedWindow(new Date('2026-05-29T14:00:00'), q);
    expect(out.toISOString()).toBe(new Date('2026-05-29T15:00:00').toISOString());
  });

  it('defers from pre-midnight tail to next day end', () => {
    const q = { start: '22:00', end: '07:00' };
    const out = deferToAllowedWindow(new Date('2026-05-29T23:30:00'), q);
    expect(out.toISOString()).toBe(new Date('2026-05-30T07:00:00').toISOString());
  });

  it('defers from post-midnight head to same day end', () => {
    const q = { start: '22:00', end: '07:00' };
    const out = deferToAllowedWindow(new Date('2026-05-29T03:00:00'), q);
    expect(out.toISOString()).toBe(new Date('2026-05-29T07:00:00').toISOString());
  });

  it('passes through instants outside quiet hours', () => {
    const q = { start: '22:00', end: '07:00' };
    const t = new Date('2026-05-29T10:00:00');
    expect(deferToAllowedWindow(t, q).toISOString()).toBe(t.toISOString());
  });
});

describe('planReminders', () => {
  const NOW = new Date('2026-05-29T12:00:00');
  it('fires at earliest of dueAt - lead and now', () => {
    const r = planReminders(
      [{ medicationId: 'm', scheduleId: 's', dueAt: new Date('2026-05-29T12:10:00') }],
      { now: NOW, leadMinutes: 5 },
    );
    expect(r[0]!.fireAt.toISOString()).toBe(new Date('2026-05-29T12:05:00').toISOString());
    expect(r[0]!.deferred).toBe(false);
    expect(r[0]!.snoozeEligible).toBe(true);
  });

  it('defers reminders that fall in quiet hours', () => {
    const r = planReminders(
      [{ medicationId: 'm', scheduleId: 's', dueAt: new Date('2026-05-30T03:00:00') }],
      { now: NOW, leadMinutes: 5, quiet: { start: '22:00', end: '07:00' } },
    );
    expect(r[0]!.deferred).toBe(true);
    expect(r[0]!.fireAt.toISOString()).toBe(new Date('2026-05-30T07:00:00').toISOString());
    expect(r[0]!.snoozeEligible).toBe(false);
  });

  it('does not defer reminders outside quiet hours', () => {
    const r = planReminders(
      [{ medicationId: 'm', scheduleId: 's', dueAt: new Date('2026-05-29T10:00:00') }],
      { now: new Date('2026-05-29T09:00:00'), leadMinutes: 10, quiet: { start: '22:00', end: '07:00' } },
    );
    expect(r[0]!.deferred).toBe(false);
  });

  it('sorts results by fireAt ascending', () => {
    const r = planReminders([
      { medicationId: 'a', scheduleId: 's', dueAt: new Date('2026-05-29T16:00:00') },
      { medicationId: 'b', scheduleId: 's', dueAt: new Date('2026-05-29T13:00:00') },
    ], { now: NOW, leadMinutes: 0 });
    expect(r.map((x) => x.medicationId)).toEqual(['b', 'a']);
  });

  it('clamps fireAt forward to now when already past lead', () => {
    const r = planReminders(
      [{ medicationId: 'm', scheduleId: 's', dueAt: new Date('2026-05-29T12:01:00') }],
      { now: NOW, leadMinutes: 30 },
    );
    expect(r[0]!.fireAt.toISOString()).toBe(NOW.toISOString());
  });
});
