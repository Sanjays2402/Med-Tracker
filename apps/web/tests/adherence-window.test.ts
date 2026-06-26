import { describe, it, expect } from 'vitest';
import {
  ADHERENCE_WINDOWS,
  WINDOW_KEYS,
  DEFAULT_ADHERENCE_WINDOW,
  resolveWindow,
  isWindowKey,
  windowDays,
  windowKeyForDays,
  cycleWindow,
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

describe('WINDOW_KEYS', () => {
  it('lists the keys in display order', () => {
    expect(WINDOW_KEYS).toEqual<AdherenceWindowKey[]>(['7d', '30d', '90d']);
  });
});

describe('isWindowKey', () => {
  it('accepts the known keys only', () => {
    expect(isWindowKey('7d')).toBe(true);
    expect(isWindowKey('30d')).toBe(true);
    expect(isWindowKey('90d')).toBe(true);
  });
  it('rejects junk, numbers, null', () => {
    expect(isWindowKey('1d')).toBe(false);
    expect(isWindowKey(30)).toBe(false);
    expect(isWindowKey(null)).toBe(false);
    expect(isWindowKey(undefined)).toBe(false);
  });
});

describe('windowKeyForDays', () => {
  it('maps an exact day count back to its key', () => {
    expect(windowKeyForDays(7)).toBe('7d');
    expect(windowKeyForDays(30)).toBe('30d');
    expect(windowKeyForDays(90)).toBe('90d');
  });
  it('falls back to the default for an unknown count', () => {
    expect(windowKeyForDays(14)).toBe('30d');
    expect(windowKeyForDays(null)).toBe('30d');
    expect(windowKeyForDays(undefined)).toBe('30d');
  });
});

describe('cycleWindow', () => {
  it('cycles forward with wraparound', () => {
    expect(cycleWindow('7d', 1)).toBe('30d');
    expect(cycleWindow('30d', 1)).toBe('90d');
    expect(cycleWindow('90d', 1)).toBe('7d');
  });
  it('cycles backward with wraparound', () => {
    expect(cycleWindow('7d', -1)).toBe('90d');
    expect(cycleWindow('90d', -1)).toBe('30d');
    expect(cycleWindow('30d', -1)).toBe('7d');
  });
  it('treats junk input as the default before stepping', () => {
    expect(cycleWindow('nope', 1)).toBe('90d'); // default 30d -> +1 -> 90d
    expect(cycleWindow(null, -1)).toBe('7d'); // default 30d -> -1 -> 7d
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
