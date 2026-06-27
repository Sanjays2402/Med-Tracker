import { describe, it, expect } from 'vitest';
import {
  milestoneProgress,
  milestoneProgressLabel,
} from '../lib/milestone-progress';

describe('milestoneProgress', () => {
  it('is null for a zero / negative / NaN streak', () => {
    expect(milestoneProgress(0)).toBeNull();
    expect(milestoneProgress(-5)).toBeNull();
    expect(milestoneProgress(Number.NaN)).toBeNull();
  });

  it('fills from 0 toward the first rung below a week', () => {
    const p = milestoneProgress(3);
    expect(p).not.toBeNull();
    expect(p!.fromDays).toBe(0);
    expect(p!.toDays).toBe(7);
    expect(p!.toLabel).toBe('a week');
    expect(p!.fraction).toBeCloseTo(3 / 7, 5);
    expect(p!.pct).toBe(43);
    expect(p!.remaining).toBe(4);
  });

  it('resets the segment the day a milestone lands', () => {
    // On day 7 the last reached rung is a week and the next is two weeks, so
    // the bar resets to 0 while the chip beside it celebrates "a week reached".
    const p = milestoneProgress(7);
    expect(p!.fromDays).toBe(7);
    expect(p!.toDays).toBe(14);
    expect(p!.toLabel).toBe('two weeks');
    expect(p!.fraction).toBe(0);
    expect(p!.pct).toBe(0);
    expect(p!.remaining).toBe(7);
  });

  it('measures progress within a mid-ladder segment', () => {
    // Day 10 sits between a week (7) and two weeks (14): 3 of 7 days in.
    const p = milestoneProgress(10);
    expect(p!.fromDays).toBe(7);
    expect(p!.toDays).toBe(14);
    expect(p!.fraction).toBeCloseTo(3 / 7, 5);
    expect(p!.remaining).toBe(4);
  });

  it('spans the long month->quarter segment', () => {
    // Day 60 is between a month (30) and three months (90): 30 of 60 days = 50%.
    const p = milestoneProgress(60);
    expect(p!.fromDays).toBe(30);
    expect(p!.toDays).toBe(90);
    expect(p!.pct).toBe(50);
    expect(p!.remaining).toBe(30);
  });

  it('is null at or past the top rung', () => {
    expect(milestoneProgress(365)).toBeNull();
    expect(milestoneProgress(500)).toBeNull();
  });

  it('floors a fractional streak before measuring', () => {
    const p = milestoneProgress(3.9);
    expect(p!.fraction).toBeCloseTo(3 / 7, 5);
  });

  it('keeps the fraction within 0..1', () => {
    for (const d of [1, 6, 7, 8, 13, 14, 29, 30, 89, 90, 179, 180, 364]) {
      const p = milestoneProgress(d);
      if (p) {
        expect(p.fraction).toBeGreaterThanOrEqual(0);
        expect(p.fraction).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('milestoneProgressLabel', () => {
  it('is null when there is no segment', () => {
    expect(milestoneProgressLabel(0)).toBeNull();
    expect(milestoneProgressLabel(365)).toBeNull();
  });

  it('reads as a starting line right after a milestone', () => {
    expect(milestoneProgressLabel(7)).toBe('starting toward two weeks');
  });

  it('reads as a percentage mid-segment', () => {
    expect(milestoneProgressLabel(60)).toBe('50% of the way to three months');
  });
});
