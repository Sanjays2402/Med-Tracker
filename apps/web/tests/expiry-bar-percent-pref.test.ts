import { describe, it, expect } from 'vitest';
import {
  EXPIRY_BAR_PCT_STORAGE_KEY,
  DEFAULT_SHOW_BAR_PERCENTS,
  normalizeShowBarPercents,
  parseShowBarPercents,
  serializeShowBarPercents,
} from '../lib/expiry-bar-percent-pref';

describe('expiry-bar-percent-pref constants', () => {
  it('has a namespaced storage key and a false default', () => {
    expect(EXPIRY_BAR_PCT_STORAGE_KEY).toBe('medtracker.caregivers.showBarPercents');
    expect(DEFAULT_SHOW_BAR_PERCENTS).toBe(false);
  });
});

describe('normalizeShowBarPercents', () => {
  it('passes booleans through', () => {
    expect(normalizeShowBarPercents(true)).toBe(true);
    expect(normalizeShowBarPercents(false)).toBe(false);
  });
  it('coerces the string tokens', () => {
    expect(normalizeShowBarPercents('true')).toBe(true);
    expect(normalizeShowBarPercents('false')).toBe(false);
  });
  it('falls back to the default on junk', () => {
    expect(normalizeShowBarPercents('yes')).toBe(false);
    expect(normalizeShowBarPercents(1)).toBe(false);
    expect(normalizeShowBarPercents(null)).toBe(false);
    expect(normalizeShowBarPercents(undefined)).toBe(false);
  });
});

describe('parseShowBarPercents', () => {
  it('parses a JSON-quoted boolean', () => {
    expect(parseShowBarPercents('true')).toBe(true);
    expect(parseShowBarPercents('false')).toBe(false);
  });
  it('tolerates a bare token', () => {
    expect(parseShowBarPercents('true')).toBe(true);
  });
  it('defaults on empty / null / junk', () => {
    expect(parseShowBarPercents(null)).toBe(false);
    expect(parseShowBarPercents('')).toBe(false);
    expect(parseShowBarPercents('garbage')).toBe(false);
  });
  it('round-trips through serialize', () => {
    expect(parseShowBarPercents(serializeShowBarPercents(true))).toBe(true);
    expect(parseShowBarPercents(serializeShowBarPercents(false))).toBe(false);
  });
});

describe('serializeShowBarPercents', () => {
  it('stores the flag as JSON', () => {
    expect(serializeShowBarPercents(true)).toBe('true');
    expect(serializeShowBarPercents(false)).toBe('false');
  });
});
