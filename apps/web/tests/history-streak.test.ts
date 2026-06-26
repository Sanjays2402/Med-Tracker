import { describe, it, expect } from 'vitest';
import {
  currentStreak,
  longestStreak,
  summarizeStreak,
  type StreakDay,
} from '../lib/history-streak';

function day(pct: number, over: Partial<StreakDay> = {}): StreakDay {
  return { pct, ...over };
}

describe('currentStreak', () => {
  it('counts consecutive on-track days back from the most recent past day', () => {
    // ... 50 (break), then 80, 90, 75 on-track trailing.
    expect(currentStreak([day(90), day(50), day(80), day(90), day(75)])).toBe(3);
  });
  it('is 0 when the latest past day is below threshold', () => {
    expect(currentStreak([day(95), day(90), day(40)])).toBe(0);
  });
  it('ignores future days entirely', () => {
    // The two future days at the end do not break the trailing streak.
    expect(currentStreak([day(90), day(85), day(0, { isFuture: true }), day(0, { isFuture: true })])).toBe(2);
  });
  it('counts the whole window when every past day is on track', () => {
    expect(currentStreak([day(80), day(90), day(100)])).toBe(3);
  });
  it('honours a custom threshold', () => {
    // At threshold 95, only the 96 trails; 80 breaks it.
    expect(currentStreak([day(80), day(96)], { onTrackThreshold: 95 })).toBe(1);
  });
  it('is 0 on an all-future / empty window', () => {
    expect(currentStreak([])).toBe(0);
    expect(currentStreak([day(0, { isFuture: true })])).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest run anywhere in the window', () => {
    // runs: [90,80,85]=3, then break, then [75,95]=2 -> 3.
    expect(longestStreak([day(90), day(80), day(85), day(40), day(75), day(95)])).toBe(3);
  });
  it('resets on a below-threshold day', () => {
    expect(longestStreak([day(90), day(30), day(90)])).toBe(1);
  });
  it('skips future days without breaking the run', () => {
    expect(longestStreak([day(90), day(0, { isFuture: true }), day(90)])).toBe(2);
  });
});

describe('summarizeStreak', () => {
  it('reports current, longest, and the start iso', () => {
    const days = [
      day(90, { iso: '2026-06-20' }),
      day(40, { iso: '2026-06-21' }),
      day(80, { iso: '2026-06-22' }),
      day(85, { iso: '2026-06-23' }),
      day(95, { iso: '2026-06-24' }),
    ];
    const s = summarizeStreak(days);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.startIso).toBe('2026-06-22');
    expect(s.isBest).toBe(true);
    expect(s.tone).toBe('ok');
  });
  it('marks isBest false when an earlier run was longer', () => {
    const days = [day(90), day(90), day(90), day(40), day(80)];
    const s = summarizeStreak(days);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
    expect(s.isBest).toBe(false);
  });
  it('reports a neutral tone and null start when the streak is broken', () => {
    const s = summarizeStreak([day(95), day(30)]);
    expect(s.current).toBe(0);
    expect(s.startIso).toBeNull();
    expect(s.tone).toBe('neutral');
    expect(s.isBest).toBe(false);
  });
  it('carries the threshold used', () => {
    expect(summarizeStreak([day(90)], { onTrackThreshold: 85 }).threshold).toBe(85);
    expect(summarizeStreak([day(90)]).threshold).toBe(70);
  });
});
