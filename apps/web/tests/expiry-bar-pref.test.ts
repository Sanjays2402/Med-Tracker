import { describe, it, expect } from 'vitest';
import {
  EXPIRY_BAR_STORAGE_KEY,
  DEFAULT_SHOW_HEALTH_BAR,
  normalizeShowHealthBar,
  parseShowHealthBar,
  serializeShowHealthBar,
} from '../lib/expiry-bar-pref';

describe('expiry-bar-pref constants', () => {
  it('has a namespaced storage key and a false default', () => {
    expect(EXPIRY_BAR_STORAGE_KEY).toBe('medtracker.caregivers.showHealthBar');
    expect(DEFAULT_SHOW_HEALTH_BAR).toBe(false);
  });
});

describe('normalizeShowHealthBar', () => {
  it('passes through booleans', () => {
    expect(normalizeShowHealthBar(true)).toBe(true);
    expect(normalizeShowHealthBar(false)).toBe(false);
  });
  it('coerces string tokens', () => {
    expect(normalizeShowHealthBar('true')).toBe(true);
    expect(normalizeShowHealthBar('false')).toBe(false);
  });
  it('falls back to the default for junk', () => {
    expect(normalizeShowHealthBar('maybe')).toBe(DEFAULT_SHOW_HEALTH_BAR);
    expect(normalizeShowHealthBar(null)).toBe(DEFAULT_SHOW_HEALTH_BAR);
    expect(normalizeShowHealthBar(1)).toBe(DEFAULT_SHOW_HEALTH_BAR);
  });
});

describe('parseShowHealthBar', () => {
  it('parses JSON-stored booleans', () => {
    expect(parseShowHealthBar('true')).toBe(true);
    expect(parseShowHealthBar('"true"')).toBe(true);
    expect(parseShowHealthBar('false')).toBe(false);
  });
  it('defaults on empty / missing / bad input', () => {
    expect(parseShowHealthBar(null)).toBe(false);
    expect(parseShowHealthBar('')).toBe(false);
    expect(parseShowHealthBar('garbage')).toBe(false);
  });
});

describe('serializeShowHealthBar', () => {
  it('round-trips through parse', () => {
    expect(parseShowHealthBar(serializeShowHealthBar(true))).toBe(true);
    expect(parseShowHealthBar(serializeShowHealthBar(false))).toBe(false);
  });
});
