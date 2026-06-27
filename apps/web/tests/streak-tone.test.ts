import { describe, it, expect } from 'vitest';
import {
  STREAK_STRONG_DAYS,
  streakTone,
  streakAccent,
  streakToneVar,
  daysToStrong,
} from '../lib/streak-tone';

describe('STREAK_STRONG_DAYS', () => {
  it('defaults to a week', () => {
    expect(STREAK_STRONG_DAYS).toBe(7);
  });
});

describe('streakTone', () => {
  it('is neutral at zero', () => {
    expect(streakTone(0)).toBe('neutral');
  });
  it('is warn while building (1..6)', () => {
    expect(streakTone(1)).toBe('warn');
    expect(streakTone(6)).toBe('warn');
  });
  it('is ok once established (7+)', () => {
    expect(streakTone(7)).toBe('ok');
    expect(streakTone(40)).toBe('ok');
  });
  it('treats negative / NaN as neutral', () => {
    expect(streakTone(-3)).toBe('neutral');
    expect(streakTone(Number.NaN)).toBe('neutral');
  });
  it('floors a fractional streak', () => {
    expect(streakTone(6.9)).toBe('warn');
    expect(streakTone(7.2)).toBe('ok');
  });
  it('honours a custom strong threshold', () => {
    expect(streakTone(3, { strongAt: 3 })).toBe('ok');
    expect(streakTone(2, { strongAt: 3 })).toBe('warn');
  });
});

describe('streakAccent', () => {
  it('is undefined for a neutral (zero) streak so the tile stays quiet', () => {
    expect(streakAccent(0)).toBeUndefined();
  });
  it('passes the tone through otherwise', () => {
    expect(streakAccent(3)).toBe('warn');
    expect(streakAccent(10)).toBe('ok');
  });
});

describe('streakToneVar', () => {
  it('maps each tone to its CSS variable', () => {
    expect(streakToneVar(0)).toBe('var(--ink-muted)');
    expect(streakToneVar(3)).toBe('var(--warn)');
    expect(streakToneVar(9)).toBe('var(--ok)');
  });
});

describe('daysToStrong', () => {
  it('is null for a zero/negative streak', () => {
    expect(daysToStrong(0)).toBeNull();
    expect(daysToStrong(-2)).toBeNull();
  });
  it('counts down to the threshold', () => {
    expect(daysToStrong(1)).toBe(6);
    expect(daysToStrong(5)).toBe(2);
  });
  it('is 0 once established', () => {
    expect(daysToStrong(7)).toBe(0);
    expect(daysToStrong(30)).toBe(0);
  });
  it('respects a custom threshold', () => {
    expect(daysToStrong(1, { strongAt: 3 })).toBe(2);
    expect(daysToStrong(3, { strongAt: 3 })).toBe(0);
  });
});
