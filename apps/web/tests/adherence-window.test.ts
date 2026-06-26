import { describe, it, expect } from 'vitest';
import {
  ADHERENCE_WINDOWS,
  DEFAULT_ADHERENCE_WINDOW,
  resolveWindow,
  windowDays,
  windowCaption,
  windowEmptyCopy,
  type AdherenceWindowKey,
} from '../lib/adherence-window';

describe('ADHERENCE_WINDOWS', () => {
  it('offers 7 / 30 / 90 day options in order', () => {
    expect(ADHERENCE_WINDOWS.map((o) => o.key)).toEqual<AdherenceWindowKey[]>(['7d', '30d', '90d']);
    expect(ADHERENCE_WINDOWS.map((o) => o.days)).toEqual([7, 30, 90]);
  });
  it('defaults to 30 days', () => {
    expect(DEFAULT_ADHERENCE_WINDOW).toBe('30d');
  });
});

describe('resolveWindow', () => {
  it('resolves a valid key to its option', () => {
    expect(resolveWindow('7d').days).toBe(7);
    expect(resolveWindow('90d').label).toBe('90 days');
  });
  it('falls back to the default for junk / null', () => {
    expect(resolveWindow('nope').key).toBe('30d');
    expect(resolveWindow(null).key).toBe('30d');
    expect(resolveWindow(undefined).key).toBe('30d');
  });
});

describe('windowDays', () => {
  it('maps a key to the numeric days for the data call', () => {
    expect(windowDays('7d')).toBe(7);
    expect(windowDays('30d')).toBe(30);
    expect(windowDays('90d')).toBe(90);
    expect(windowDays('garbage')).toBe(30);
  });
});

describe('windowCaption', () => {
  it('renders a "last N days" caption', () => {
    expect(windowCaption('7d')).toBe('last 7 days');
    expect(windowCaption('90d')).toBe('last 90 days');
  });
});

describe('windowEmptyCopy', () => {
  it('tunes the empty message to the window length', () => {
    expect(windowEmptyCopy('7d')).toMatch(/last 7 days/);
    expect(windowEmptyCopy('30d')).toMatch(/per-medication/);
    expect(windowEmptyCopy('90d')).toMatch(/90-day/);
  });
});
