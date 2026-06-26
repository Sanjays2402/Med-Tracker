import { describe, it, expect } from 'vitest';
import {
  RUNOUT_GROUP_STORAGE_KEY,
  DEFAULT_RUNOUT_GROUP,
  normalizeRunoutGroup,
  parseRunoutGroup,
  serializeRunoutGroup,
} from '../lib/runout-group-pref';

describe('constants', () => {
  it('defaults to off (flat list)', () => {
    expect(DEFAULT_RUNOUT_GROUP).toBe(false);
  });
  it('has a stable storage key distinct from density', () => {
    expect(RUNOUT_GROUP_STORAGE_KEY).toBe('medtracker.medications.runoutGroup');
  });
});

describe('normalizeRunoutGroup', () => {
  it('passes through real booleans', () => {
    expect(normalizeRunoutGroup(true)).toBe(true);
    expect(normalizeRunoutGroup(false)).toBe(false);
  });
  it('coerces the string tokens "true" / "false"', () => {
    expect(normalizeRunoutGroup('true')).toBe(true);
    expect(normalizeRunoutGroup('false')).toBe(false);
  });
  it('falls back to the default for junk', () => {
    expect(normalizeRunoutGroup('yes')).toBe(false);
    expect(normalizeRunoutGroup(1)).toBe(false);
    expect(normalizeRunoutGroup(null)).toBe(false);
    expect(normalizeRunoutGroup(undefined)).toBe(false);
    expect(normalizeRunoutGroup({})).toBe(false);
  });
});

describe('parseRunoutGroup', () => {
  it('parses a JSON-quoted boolean (how safeLocalStorage stores it)', () => {
    expect(parseRunoutGroup('true')).toBe(true);
    expect(parseRunoutGroup('false')).toBe(false);
  });
  it('parses a bare token', () => {
    // After JSON.parse fails on a bare word it falls through to normalize.
    expect(parseRunoutGroup('true')).toBe(true);
  });
  it('returns the default for null / empty / junk', () => {
    expect(parseRunoutGroup(null)).toBe(false);
    expect(parseRunoutGroup(undefined)).toBe(false);
    expect(parseRunoutGroup('')).toBe(false);
    expect(parseRunoutGroup('{not valid')).toBe(false);
  });
  it('treats a stored 0/1 number string as the default (only booleans count)', () => {
    expect(parseRunoutGroup('1')).toBe(false);
    expect(parseRunoutGroup('0')).toBe(false);
  });
});

describe('serializeRunoutGroup', () => {
  it('round-trips through parse', () => {
    expect(parseRunoutGroup(serializeRunoutGroup(true))).toBe(true);
    expect(parseRunoutGroup(serializeRunoutGroup(false))).toBe(false);
  });
  it('produces canonical JSON', () => {
    expect(serializeRunoutGroup(true)).toBe('true');
    expect(serializeRunoutGroup(false)).toBe('false');
  });
});
