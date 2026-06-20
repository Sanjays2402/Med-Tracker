import { describe, it, expect } from 'vitest';
import {
  decideSnoozeAction,
  recordSnooze,
  snoozeLadder,
  type SnoozeEvent,
  type SnoozePolicy,
} from '../src/reminder-snooze-policy';

const DUE = new Date(2026, 5, 20, 8, 0, 0); // Jun 20 2026 08:00 local

function ev(minutesAfterDue: number, duration: number): SnoozeEvent {
  return {
    at: new Date(DUE.getTime() + minutesAfterDue * 60_000).toISOString(),
    durationMinutes: duration,
  };
}

describe('decideSnoozeAction', () => {
  it('allows the first snooze with the base duration', () => {
    const now = new Date(DUE.getTime() + 1 * 60_000);
    const d = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [],
      now,
    });
    expect(d.action).toBe('allow');
    expect(d.nextSnoozeMinutes).toBe(10);
    expect(d.snoozesUsed).toBe(1);
    expect(new Date(d.nextFireAt!).getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('escalates the snooze duration when escalationFactor > 1', () => {
    const policy: SnoozePolicy = {
      maxSnoozes: 4,
      baseSnoozeMinutes: 5,
      escalationFactor: 2,
      maxSnoozeMinutes: 60,
      escalateAfterSnoozes: 4, // never escalate before maxSnoozes for this test
    };
    // 1st snooze: 5; 2nd: 10; 3rd: 20; 4th: 40.
    const at = (n: number): Date => new Date(DUE.getTime() + n * 60_000);
    const h0: SnoozeEvent[] = [];
    expect(decideSnoozeAction({ dueAt: DUE.toISOString(), history: h0, now: at(1), policy }).nextSnoozeMinutes).toBe(5);
    const h1: SnoozeEvent[] = [ev(1, 5)];
    expect(decideSnoozeAction({ dueAt: DUE.toISOString(), history: h1, now: at(6), policy }).nextSnoozeMinutes).toBe(10);
    const h2: SnoozeEvent[] = [ev(1, 5), ev(6, 10)];
    expect(decideSnoozeAction({ dueAt: DUE.toISOString(), history: h2, now: at(16), policy }).nextSnoozeMinutes).toBe(20);
    const h3: SnoozeEvent[] = [ev(1, 5), ev(6, 10), ev(16, 20)];
    expect(decideSnoozeAction({ dueAt: DUE.toISOString(), history: h3, now: at(36), policy }).nextSnoozeMinutes).toBe(40);
  });

  it('clamps escalated snooze duration at maxSnoozeMinutes', () => {
    const policy: SnoozePolicy = {
      maxSnoozes: 5,
      baseSnoozeMinutes: 10,
      escalationFactor: 4,
      maxSnoozeMinutes: 60,
      escalateAfterSnoozes: 5,
    };
    // 1: 10, 2: 40, 3: clamped to 60, 4: 60, 5: 60.
    expect(snoozeLadder(policy)).toEqual([10, 40, 60, 60, 60]);
  });

  it('auto-skips when maxSnoozes reached', () => {
    const policy: SnoozePolicy = { maxSnoozes: 2, baseSnoozeMinutes: 10 };
    const now = new Date(DUE.getTime() + 25 * 60_000);
    const d = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [ev(1, 10), ev(15, 10)],
      now,
      policy,
    });
    expect(d.action).toBe('auto-skip');
    expect(d.nextFireAt).toBeNull();
    expect(d.reason).toMatch(/maximum 2 snoozes/);
  });

  it('auto-skips when elapsed exceeds autoSkipAfterMinutes regardless of snooze count', () => {
    const policy: SnoozePolicy = {
      maxSnoozes: 10,
      autoSkipAfterMinutes: 60,
    };
    const now = new Date(DUE.getTime() + 90 * 60_000);
    const d = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [],
      now,
      policy,
    });
    expect(d.action).toBe('auto-skip');
    expect(d.reason).toMatch(/exceeds 60-minute cap/);
  });

  it('escalates after escalateAfterSnoozes but before maxSnoozes', () => {
    const policy: SnoozePolicy = {
      maxSnoozes: 4,
      baseSnoozeMinutes: 5,
      escalateAfterSnoozes: 2,
    };
    const now = new Date(DUE.getTime() + 15 * 60_000);
    const d = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [ev(1, 5), ev(6, 5)],
      now,
      policy,
    });
    expect(d.action).toBe('escalate');
    expect(d.nextFireAt).toBe(now.toISOString());
    expect(d.nextSnoozeMinutes).toBe(0);
    expect(d.snoozesUsed).toBe(3);
    expect(d.reason).toMatch(/Escalating after 2 snoozes/);
  });

  it('escalates exactly once before the auto-skip in default policy', () => {
    // Default: maxSnoozes=3, escalateAfterSnoozes defaults to 2.
    const policy: SnoozePolicy = {};
    const now1 = new Date(DUE.getTime() + 25 * 60_000);
    // After 2 snoozes -> escalate.
    const d1 = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [ev(1, 10), ev(11, 10)],
      now: now1,
      policy,
    });
    expect(d1.action).toBe('escalate');
    // After 3 snoozes -> auto-skip.
    const now2 = new Date(DUE.getTime() + 35 * 60_000);
    const d2 = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [ev(1, 10), ev(11, 10), ev(25, 10)],
      now: now2,
      policy,
    });
    expect(d2.action).toBe('auto-skip');
  });

  it('treats negative escalateAfterSnoozes as default (maxSnoozes - 1)', () => {
    const policy: SnoozePolicy = { maxSnoozes: 5, escalateAfterSnoozes: -1 };
    const now = new Date(DUE.getTime() + 1 * 60_000);
    // 0 snoozes used -> allow.
    const d = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [],
      now,
      policy,
    });
    expect(d.action).toBe('allow');
    // 4 snoozes used (one less than max) -> escalate.
    const now2 = new Date(DUE.getTime() + 60 * 60_000);
    const d2 = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [ev(1, 10), ev(11, 10), ev(21, 10), ev(31, 10)],
      now: now2,
      policy,
    });
    expect(d2.action).toBe('escalate');
  });

  it('uses zero elapsed when now is before dueAt (sanity)', () => {
    const before = new Date(DUE.getTime() - 5 * 60_000);
    const d = decideSnoozeAction({
      dueAt: DUE.toISOString(),
      history: [],
      now: before,
    });
    expect(d.action).toBe('allow');
  });

  it('rounds escalated snooze to integer minutes', () => {
    const policy: SnoozePolicy = {
      maxSnoozes: 3,
      baseSnoozeMinutes: 7,
      escalationFactor: 1.5,
    };
    // 1: 7, 2: 10.5 -> 11, 3: 15.75 -> 16
    expect(snoozeLadder(policy)).toEqual([7, 11, 16]);
  });

  it('enforces a 1-minute floor on snooze duration', () => {
    const policy: SnoozePolicy = {
      maxSnoozes: 2,
      baseSnoozeMinutes: 0,
    };
    expect(snoozeLadder(policy)).toEqual([1, 1]);
  });
});

describe('recordSnooze', () => {
  it('appends an event for an allow decision', () => {
    const dec = {
      action: 'allow' as const,
      nextFireAt: new Date().toISOString(),
      nextSnoozeMinutes: 10,
      snoozesUsed: 1,
      reason: '',
    };
    const out = recordSnooze([], dec, new Date(DUE.getTime() + 1 * 60_000));
    expect(out).toHaveLength(1);
    expect(out[0]!.durationMinutes).toBe(10);
  });

  it('appends an event for an escalate decision', () => {
    const dec = {
      action: 'escalate' as const,
      nextFireAt: new Date().toISOString(),
      nextSnoozeMinutes: 0,
      snoozesUsed: 3,
      reason: '',
    };
    const out = recordSnooze([ev(0, 5)], dec, new Date());
    expect(out).toHaveLength(2);
  });

  it('does NOT append for auto-skip', () => {
    const dec = {
      action: 'auto-skip' as const,
      nextFireAt: null,
      nextSnoozeMinutes: null,
      snoozesUsed: 3,
      reason: '',
    };
    const out = recordSnooze([ev(0, 5)], dec, new Date());
    expect(out).toHaveLength(1);
  });
});

describe('snoozeLadder', () => {
  it('returns the default 10/10/10 ladder when no policy is provided', () => {
    expect(snoozeLadder()).toEqual([10, 10, 10]);
  });

  it('returns the ladder length equal to maxSnoozes', () => {
    const ladder = snoozeLadder({ maxSnoozes: 5, baseSnoozeMinutes: 5, escalationFactor: 1 });
    expect(ladder).toHaveLength(5);
  });

  it('previews a 5/10/20 ladder for a doubling policy', () => {
    expect(
      snoozeLadder({ maxSnoozes: 3, baseSnoozeMinutes: 5, escalationFactor: 2 }),
    ).toEqual([5, 10, 20]);
  });
});
