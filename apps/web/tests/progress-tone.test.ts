import { describe, it, expect } from 'vitest';
import { progressTone, progressToneVar } from '../lib/progress-tone';

describe('progressTone', () => {
  it('is danger when barely started', () => {
    expect(progressTone(0)).toBe('danger');
    expect(progressTone(10)).toBe('danger');
    expect(progressTone(33)).toBe('danger');
  });

  it('is warn when underway', () => {
    expect(progressTone(34)).toBe('warn');
    expect(progressTone(50)).toBe('warn');
    expect(progressTone(66)).toBe('warn');
  });

  it('is ok when nearly there or done', () => {
    expect(progressTone(67)).toBe('ok');
    expect(progressTone(80)).toBe('ok');
    expect(progressTone(100)).toBe('ok');
  });

  it('treats the band boundaries as inclusive lower edges', () => {
    // 34 enters warn, 67 enters ok.
    expect(progressTone(33)).toBe('danger');
    expect(progressTone(34)).toBe('warn');
    expect(progressTone(66)).toBe('warn');
    expect(progressTone(67)).toBe('ok');
  });

  it('clamps out-of-range values', () => {
    expect(progressTone(140)).toBe('ok');
    expect(progressTone(-20)).toBe('danger');
  });

  it('floors fractional percentages before banding', () => {
    // 66.9 floors to 66 -> still warn (not yet ok).
    expect(progressTone(66.9)).toBe('warn');
    expect(progressTone(67.1)).toBe('ok');
  });

  it('treats non-finite input as 0 (danger)', () => {
    expect(progressTone(Number.NaN)).toBe('danger');
    expect(progressTone(Number.POSITIVE_INFINITY)).toBe('danger'); // non-finite -> 0
  });

  it('honours custom thresholds', () => {
    // Tighter ok band: only 90+ is sage; 50 stays warn under warnAt 25.
    expect(progressTone(80, { okAt: 90 })).toBe('warn');
    expect(progressTone(90, { okAt: 90 })).toBe('ok');
    expect(progressTone(20, { warnAt: 25 })).toBe('danger');
    expect(progressTone(25, { warnAt: 25 })).toBe('warn');
  });
});

describe('progressToneVar', () => {
  it('maps each band to its CSS custom property', () => {
    expect(progressToneVar(10)).toBe('var(--danger)');
    expect(progressToneVar(50)).toBe('var(--warn)');
    expect(progressToneVar(90)).toBe('var(--ok)');
  });

  it('follows custom thresholds', () => {
    expect(progressToneVar(80, { okAt: 90 })).toBe('var(--warn)');
    expect(progressToneVar(90, { okAt: 90 })).toBe('var(--ok)');
  });
});
