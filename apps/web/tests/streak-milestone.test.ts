import { describe, it, expect } from 'vitest';
import {
  STREAK_MILESTONES,
  nextStreakMilestone,
  daysToNextMilestone,
  reachedMilestone,
  highestMilestoneReached,
  streakMilestoneChip,
} from '../lib/streak-milestone';

describe('STREAK_MILESTONES', () => {
  it('is an ascending ladder starting at a week', () => {
    expect(STREAK_MILESTONES[0]).toEqual({ days: 7, label: 'a week' });
    const days = STREAK_MILESTONES.map((m) => m.days);
    const sorted = [...days].sort((a, b) => a - b);
    expect(days).toEqual(sorted);
  });
  it('tops out at a year', () => {
    expect(STREAK_MILESTONES[STREAK_MILESTONES.length - 1]).toEqual({ days: 365, label: 'a year' });
  });
});

describe('nextStreakMilestone', () => {
  it('points at the first rung from zero', () => {
    expect(nextStreakMilestone(0)?.days).toBe(7);
  });
  it('points strictly above the current streak', () => {
    expect(nextStreakMilestone(7)?.days).toBe(14);
    expect(nextStreakMilestone(6)?.days).toBe(7);
    expect(nextStreakMilestone(29)?.days).toBe(30);
  });
  it('is null once past the top rung', () => {
    expect(nextStreakMilestone(365)).toBeNull();
    expect(nextStreakMilestone(400)).toBeNull();
  });
  it('floors a fractional streak', () => {
    expect(nextStreakMilestone(6.9)?.days).toBe(7);
  });
});

describe('daysToNextMilestone', () => {
  it('counts whole days to the next rung', () => {
    expect(daysToNextMilestone(5)).toBe(2);
    expect(daysToNextMilestone(7)).toBe(7); // -> two weeks
    expect(daysToNextMilestone(0)).toBe(7);
  });
  it('is null at/over the top rung', () => {
    expect(daysToNextMilestone(365)).toBeNull();
  });
});

describe('reachedMilestone', () => {
  it('matches only an exact landing', () => {
    expect(reachedMilestone(7)?.label).toBe('a week');
    expect(reachedMilestone(30)?.label).toBe('a month');
    expect(reachedMilestone(8)).toBeNull();
    expect(reachedMilestone(0)).toBeNull();
  });
});

describe('highestMilestoneReached', () => {
  it('is null below the first rung', () => {
    expect(highestMilestoneReached(6)).toBeNull();
  });
  it('returns the highest met-or-passed milestone', () => {
    expect(highestMilestoneReached(7)?.days).toBe(7);
    expect(highestMilestoneReached(40)?.days).toBe(30);
    expect(highestMilestoneReached(1000)?.days).toBe(365);
  });
});

describe('streakMilestoneChip', () => {
  it('is null for a zero / negative / NaN streak', () => {
    expect(streakMilestoneChip(0)).toBeNull();
    expect(streakMilestoneChip(-4)).toBeNull();
    expect(streakMilestoneChip(Number.NaN)).toBeNull();
  });
  it('celebrates the day a milestone lands', () => {
    const chip = streakMilestoneChip(7);
    expect(chip).toEqual({ label: 'a week reached', reached: true, tone: 'ok', remaining: 0 });
    expect(streakMilestoneChip(30)?.label).toBe('a month reached');
  });
  it('counts down while building', () => {
    expect(streakMilestoneChip(5)).toEqual({
      label: '2 days to a week',
      reached: false,
      tone: 'accent',
      remaining: 2,
    });
  });
  it('uses a singular day when one day remains', () => {
    expect(streakMilestoneChip(6)?.label).toBe('1 day to a week');
  });
  it('is null once past the top rung with no exact landing', () => {
    expect(streakMilestoneChip(400)).toBeNull();
  });
  it('still celebrates an exact landing on the top rung', () => {
    expect(streakMilestoneChip(365)).toEqual({
      label: 'a year reached',
      reached: true,
      tone: 'ok',
      remaining: 0,
    });
  });
});
