import { describe, it, expect } from 'vitest';
import {
  dayLoad,
  densityDots,
  densityForNames,
  LOAD_TONE_VAR,
  type DayLoad,
} from '../lib/month-density';

describe('dayLoad', () => {
  it('buckets counts into load tiers', () => {
    expect(dayLoad(0)).toBe<DayLoad>('none');
    expect(dayLoad(1)).toBe('light');
    expect(dayLoad(2)).toBe('light');
    expect(dayLoad(3)).toBe('steady');
    expect(dayLoad(4)).toBe('steady');
    expect(dayLoad(5)).toBe('busy');
    expect(dayLoad(6)).toBe('busy');
    expect(dayLoad(7)).toBe('heavy');
    expect(dayLoad(12)).toBe('heavy');
  });
});

describe('densityDots', () => {
  it('renders one dot per dose up to the cap', () => {
    const d = densityDots(3);
    expect(d.count).toBe(3);
    expect(d.dots).toBe(3);
    expect(d.overflow).toBe(false);
    expect(d.overflowCount).toBe(0);
    expect(d.load).toBe('steady');
  });
  it('caps the dots and surfaces the overflow', () => {
    const d = densityDots(8); // default cap 5
    expect(d.dots).toBe(5);
    expect(d.overflow).toBe(true);
    expect(d.overflowCount).toBe(3);
    expect(d.load).toBe('heavy');
  });
  it('honours a custom cap', () => {
    const d = densityDots(5, { maxDots: 3 });
    expect(d.dots).toBe(3);
    expect(d.overflowCount).toBe(2);
  });
  it('treats exactly the cap as no overflow', () => {
    const d = densityDots(5, { maxDots: 5 });
    expect(d.dots).toBe(5);
    expect(d.overflow).toBe(false);
    expect(d.overflowCount).toBe(0);
  });
  it('clamps a zero / negative / NaN count to an empty none-day', () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = densityDots(bad);
      expect(d.count).toBe(0);
      expect(d.dots).toBe(0);
      expect(d.overflow).toBe(false);
      expect(d.load).toBe('none');
    }
  });
  it('floors a fractional count', () => {
    expect(densityDots(2.9).count).toBe(2);
  });
});

describe('densityForNames', () => {
  it('derives the model from a name list length', () => {
    expect(densityForNames(['A', 'B', 'C']).dots).toBe(3);
  });
  it('treats undefined / empty as a none-day', () => {
    expect(densityForNames(undefined).load).toBe('none');
    expect(densityForNames([]).dots).toBe(0);
  });
});

describe('LOAD_TONE_VAR', () => {
  it('maps every load tier to a CSS var', () => {
    const tiers: DayLoad[] = ['none', 'light', 'steady', 'busy', 'heavy'];
    for (const t of tiers) expect(LOAD_TONE_VAR[t]).toMatch(/^var\(--/);
  });
});
