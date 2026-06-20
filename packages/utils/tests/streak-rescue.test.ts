import { describe, it, expect } from 'vitest';
import { evaluateStreakRescue, streakDaysAsOf } from '../src/streak-rescue';

// 12:00 on the test "day" so we can easily place doses earlier/later.
const today = new Date('2026-06-20T12:00:00');
const at = (offsetDays: number, hour: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('evaluateStreakRescue', () => {
  it('safe when today already has a take and nothing else due', () => {
    const out = evaluateStreakRescue({
      now: today,
      doses: [
        { dueAt: at(0, 8), takenAt: at(0, 8) },
        { dueAt: at(-1, 8), takenAt: at(-1, 8) },
      ],
    });
    expect(out.status).toBe('safe');
    expect(out.currentStreak).toBe(2);
  });

  it('at-risk when doses are still due today', () => {
    const out = evaluateStreakRescue({
      now: new Date('2026-06-20T20:00:00'),
      doses: [
        { dueAt: at(0, 8), takenAt: at(0, 8) },
        { dueAt: at(0, 22), takenAt: null },
        { dueAt: at(-1, 8), takenAt: at(-1, 8) },
      ],
    });
    expect(out.status).toBe('at-risk');
    expect(out.remainingToday).toBe(1);
    expect(out.minutesUntilDeadline).toBeGreaterThan(0);
    expect(out.rescueDeadline).toBeTruthy();
  });

  it('grace-take inside the early-morning window', () => {
    // It is 00:30 the next day; yesterday had one take and one miss.
    const now = new Date('2026-06-21T00:30:00');
    const out = evaluateStreakRescue({
      now,
      graceMinutes: 120,
      doses: [
        { dueAt: at(0, 8), takenAt: at(0, 8) },
        { dueAt: at(0, 20), takenAt: null },
      ],
    });
    expect(out.status).toBe('grace-take');
    expect(out.minutesUntilDeadline).toBeGreaterThan(0);
    expect(out.action).toMatch(/grace/);
  });

  it('makeup-available when yesterday broke a prior streak', () => {
    // Day -2 and -3 had takes (streak of 2), yesterday missed, today not yet.
    const now = new Date('2026-06-20T15:00:00');
    const out = evaluateStreakRescue({
      now,
      doses: [
        { dueAt: at(-3, 9), takenAt: at(-3, 9) },
        { dueAt: at(-2, 9), takenAt: at(-2, 9) },
        { dueAt: at(-1, 9), takenAt: null },
      ],
    });
    expect(out.status).toBe('makeup-available');
    expect(out.currentStreak).toBe(2);
    expect(out.minutesUntilDeadline).toBeGreaterThan(0);
  });

  it('broken when no rescue path exists', () => {
    const now = new Date('2026-06-20T15:00:00');
    const out = evaluateStreakRescue({
      now,
      doses: [
        // Only old, unrelated taken doses; nothing for the last 5 days.
        { dueAt: at(-10, 9), takenAt: at(-10, 9) },
      ],
    });
    expect(out.status).toBe('broken');
    expect(out.currentStreak).toBe(0);
  });

  it('disables makeup when allowMakeup=false', () => {
    const now = new Date('2026-06-20T15:00:00');
    const out = evaluateStreakRescue({
      now,
      allowMakeup: false,
      doses: [
        { dueAt: at(-3, 9), takenAt: at(-3, 9) },
        { dueAt: at(-2, 9), takenAt: at(-2, 9) },
        { dueAt: at(-1, 9), takenAt: null },
      ],
    });
    expect(out.status).toBe('broken');
  });
});

describe('streakDaysAsOf', () => {
  it('counts consecutive taken days going back', () => {
    expect(streakDaysAsOf([
      { dueAt: at(0, 8), takenAt: at(0, 8) },
      { dueAt: at(-1, 8), takenAt: at(-1, 8) },
      { dueAt: at(-2, 8), takenAt: at(-2, 8) },
    ], today)).toBe(3);
  });

  it('stops at the first missed day', () => {
    expect(streakDaysAsOf([
      { dueAt: at(0, 8), takenAt: at(0, 8) },
      { dueAt: at(-1, 8), takenAt: null },
      { dueAt: at(-2, 8), takenAt: at(-2, 8) },
    ], today)).toBe(1);
  });
});
