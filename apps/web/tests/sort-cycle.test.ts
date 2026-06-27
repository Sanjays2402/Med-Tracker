import { describe, it, expect } from 'vitest';
import { cycleKey, cycleMedSort, MED_SORT_KEYS } from '../lib/sort-cycle';
import type { MedSortKey } from '../lib/medication-sort';

describe('cycleKey', () => {
  const ring = ['a', 'b', 'c'] as const;

  it('advances forward and wraps at the end', () => {
    expect(cycleKey(ring, 'a')).toBe('b');
    expect(cycleKey(ring, 'b')).toBe('c');
    expect(cycleKey(ring, 'c')).toBe('a');
  });

  it('steps backward and wraps at the start', () => {
    expect(cycleKey(ring, 'a', -1)).toBe('c');
    expect(cycleKey(ring, 'c', -1)).toBe('b');
  });

  it('treats an unknown / missing current as before-the-first', () => {
    expect(cycleKey(ring, 'z')).toBe('a');
    expect(cycleKey(ring, null)).toBe('a');
    expect(cycleKey(ring, undefined)).toBe('a');
    expect(cycleKey(ring, 'z', -1)).toBe('c');
  });

  it('returns undefined for an empty ring', () => {
    expect(cycleKey([], 'a')).toBeUndefined();
  });

  it('returns the only entry for a single-element ring', () => {
    expect(cycleKey(['solo'] as const, 'solo')).toBe('solo');
    expect(cycleKey(['solo'] as const, 'solo', -1)).toBe('solo');
  });
});

describe('MED_SORT_KEYS', () => {
  it('is the medication sort ring in display order', () => {
    expect(MED_SORT_KEYS).toEqual(['name', 'supply', 'runout']);
  });

  it('stays assignable to MedSortKey', () => {
    // Compile-time guard: every ring key is a valid MedSortKey.
    const keys: MedSortKey[] = [...MED_SORT_KEYS];
    expect(keys).toHaveLength(3);
  });
});

describe('cycleMedSort', () => {
  it('cycles name -> supply -> runout -> name', () => {
    expect(cycleMedSort('name')).toBe('supply');
    expect(cycleMedSort('supply')).toBe('runout');
    expect(cycleMedSort('runout')).toBe('name');
  });

  it('cycles backward', () => {
    expect(cycleMedSort('name', -1)).toBe('runout');
    expect(cycleMedSort('runout', -1)).toBe('supply');
  });

  it('restarts at supply from a junk key on a forward press', () => {
    expect(cycleMedSort('bogus')).toBe('supply');
    expect(cycleMedSort(null)).toBe('supply');
    expect(cycleMedSort(undefined)).toBe('supply');
  });
});
