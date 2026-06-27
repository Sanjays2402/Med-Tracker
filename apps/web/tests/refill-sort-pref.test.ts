import { describe, it, expect } from 'vitest';
import {
  REFILL_SORT_STORAGE_KEY,
  DEFAULT_REFILL_SORT,
  normalizeRefillSort,
  parseRefillSort,
  serializeRefillSort,
  isKnownRefillSort,
} from '../lib/refill-sort-pref';
import type { RefillSortKey } from '../lib/refill-sort';

describe('constants', () => {
  it('defaults to the server/input order', () => {
    expect(DEFAULT_REFILL_SORT).toBe<RefillSortKey>('default');
  });
  it('has a stable storage key distinct from the medications prefs', () => {
    expect(REFILL_SORT_STORAGE_KEY).toBe('medtracker.refills.sort');
    expect(REFILL_SORT_STORAGE_KEY).not.toBe('medtracker.medications.runoutGroup');
  });
});

describe('normalizeRefillSort', () => {
  it('passes through the valid keys', () => {
    expect(normalizeRefillSort('default')).toBe('default');
    expect(normalizeRefillSort('runout')).toBe('runout');
  });
  it('falls back to the default for junk', () => {
    expect(normalizeRefillSort('name')).toBe('default');
    expect(normalizeRefillSort('')).toBe('default');
    expect(normalizeRefillSort(1)).toBe('default');
    expect(normalizeRefillSort(null)).toBe('default');
    expect(normalizeRefillSort(undefined)).toBe('default');
    expect(normalizeRefillSort({})).toBe('default');
  });
});

describe('parseRefillSort', () => {
  it('parses a JSON-quoted key (how safeLocalStorage stores it)', () => {
    expect(parseRefillSort('"runout"')).toBe('runout');
    expect(parseRefillSort('"default"')).toBe('default');
  });
  it('parses a bare token', () => {
    expect(parseRefillSort('runout')).toBe('runout');
    expect(parseRefillSort('default')).toBe('default');
  });
  it('returns the default for null / empty / junk', () => {
    expect(parseRefillSort(null)).toBe('default');
    expect(parseRefillSort(undefined)).toBe('default');
    expect(parseRefillSort('')).toBe('default');
    expect(parseRefillSort('{not valid')).toBe('default');
    expect(parseRefillSort('"name"')).toBe('default');
  });
});

describe('serializeRefillSort', () => {
  it('round-trips through parse', () => {
    expect(parseRefillSort(serializeRefillSort('runout'))).toBe('runout');
    expect(parseRefillSort(serializeRefillSort('default'))).toBe('default');
  });
  it('produces canonical JSON', () => {
    expect(serializeRefillSort('runout')).toBe('"runout"');
    expect(serializeRefillSort('default')).toBe('"default"');
  });
  it('normalizes a junk key before serialising', () => {
    expect(serializeRefillSort('whoops' as RefillSortKey)).toBe('"default"');
  });
});

describe('isKnownRefillSort', () => {
  it('recognises the offered keys', () => {
    expect(isKnownRefillSort('default')).toBe(true);
    expect(isKnownRefillSort('runout')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isKnownRefillSort('name')).toBe(false);
    expect(isKnownRefillSort('')).toBe(false);
  });
});
