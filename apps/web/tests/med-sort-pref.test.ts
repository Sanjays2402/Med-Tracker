import { describe, it, expect } from 'vitest';
import {
  MED_SORT_STORAGE_KEY,
  DEFAULT_MED_SORT,
  normalizeMedSort,
  parseMedSort,
  serializeMedSort,
  isKnownMedSort,
} from '../lib/med-sort-pref';
import type { MedSortKey } from '../lib/medication-sort';

describe('constants', () => {
  it('defaults to name (A-Z), the list default', () => {
    expect(DEFAULT_MED_SORT).toBe<MedSortKey>('name');
  });
  it('has a stable storage key distinct from the other medications prefs', () => {
    expect(MED_SORT_STORAGE_KEY).toBe('medtracker.medications.sort');
    expect(MED_SORT_STORAGE_KEY).not.toBe('medtracker.medications.density');
    expect(MED_SORT_STORAGE_KEY).not.toBe('medtracker.refills.sort');
  });
});

describe('normalizeMedSort', () => {
  it('passes through the valid keys', () => {
    expect(normalizeMedSort('name')).toBe('name');
    expect(normalizeMedSort('supply')).toBe('supply');
    expect(normalizeMedSort('runout')).toBe('runout');
  });
  it('falls back to the default for junk', () => {
    expect(normalizeMedSort('default')).toBe('name');
    expect(normalizeMedSort('')).toBe('name');
    expect(normalizeMedSort(2)).toBe('name');
    expect(normalizeMedSort(null)).toBe('name');
    expect(normalizeMedSort(undefined)).toBe('name');
    expect(normalizeMedSort({})).toBe('name');
  });
});

describe('parseMedSort', () => {
  it('parses a JSON-quoted key (how safeLocalStorage stores it)', () => {
    expect(parseMedSort('"supply"')).toBe('supply');
    expect(parseMedSort('"runout"')).toBe('runout');
    expect(parseMedSort('"name"')).toBe('name');
  });
  it('parses a bare token', () => {
    expect(parseMedSort('supply')).toBe('supply');
    expect(parseMedSort('runout')).toBe('runout');
  });
  it('returns the default for null / empty / junk', () => {
    expect(parseMedSort(null)).toBe('name');
    expect(parseMedSort(undefined)).toBe('name');
    expect(parseMedSort('')).toBe('name');
    expect(parseMedSort('{not valid')).toBe('name');
    expect(parseMedSort('"price"')).toBe('name');
  });
});

describe('serializeMedSort', () => {
  it('round-trips through parse', () => {
    expect(parseMedSort(serializeMedSort('supply'))).toBe('supply');
    expect(parseMedSort(serializeMedSort('runout'))).toBe('runout');
    expect(parseMedSort(serializeMedSort('name'))).toBe('name');
  });
  it('produces canonical JSON', () => {
    expect(serializeMedSort('supply')).toBe('"supply"');
    expect(serializeMedSort('name')).toBe('"name"');
  });
  it('normalizes a junk key before serialising', () => {
    expect(serializeMedSort('whoops' as MedSortKey)).toBe('"name"');
  });
});

describe('isKnownMedSort', () => {
  it('recognises the offered keys', () => {
    expect(isKnownMedSort('name')).toBe(true);
    expect(isKnownMedSort('supply')).toBe(true);
    expect(isKnownMedSort('runout')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isKnownMedSort('price')).toBe(false);
    expect(isKnownMedSort('')).toBe(false);
  });
});
