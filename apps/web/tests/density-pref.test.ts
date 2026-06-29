import { describe, it, expect } from 'vitest';
import {
  DENSITY_OPTIONS,
  DEFAULT_DENSITY,
  DENSITY_STORAGE_KEY,
  normalizeDensity,
  parseDensity,
  densityConfig,
  toggleDensity,
  otherDensityLabel,
  type Density,
} from '../lib/density-pref';

describe('DENSITY_OPTIONS', () => {
  it('offers comfortable and compact', () => {
    expect(DENSITY_OPTIONS.map((o) => o.value)).toEqual<Density[]>(['comfortable', 'compact']);
  });
  it('defaults to comfortable', () => {
    expect(DEFAULT_DENSITY).toBe('comfortable');
  });
  it('has a stable storage key', () => {
    expect(DENSITY_STORAGE_KEY).toBe('medtracker.medications.density');
  });
});

describe('normalizeDensity', () => {
  it('passes through valid values', () => {
    expect(normalizeDensity('compact')).toBe('compact');
    expect(normalizeDensity('comfortable')).toBe('comfortable');
  });
  it('falls back to the default for junk', () => {
    expect(normalizeDensity('cozy')).toBe('comfortable');
    expect(normalizeDensity(null)).toBe('comfortable');
    expect(normalizeDensity(undefined)).toBe('comfortable');
    expect(normalizeDensity(42)).toBe('comfortable');
  });
});

describe('parseDensity', () => {
  it('parses a JSON-quoted token (how safeLocalStorage stores it)', () => {
    expect(parseDensity('"compact"')).toBe('compact');
  });
  it('parses a bare token', () => {
    expect(parseDensity('compact')).toBe('compact');
  });
  it('returns the default for null / empty / junk', () => {
    expect(parseDensity(null)).toBe('comfortable');
    expect(parseDensity('')).toBe('comfortable');
    expect(parseDensity('{not valid')).toBe('comfortable');
  });
});

describe('densityConfig', () => {
  it('comfortable keeps the subline + sparkline and roomy padding', () => {
    const c = densityConfig('comfortable');
    expect(c.showSubline).toBe(true);
    expect(c.showSparkline).toBe(true);
    expect(c.showSupplyBar).toBe(true);
    expect(c.rowPadding).toBe('p-3');
    expect(c.iconSize).toBe(18);
  });
  it('compact hides the subline + sparkline and tightens the row', () => {
    const c = densityConfig('compact');
    expect(c.showSubline).toBe(false);
    expect(c.showSparkline).toBe(false);
    expect(c.showSupplyBar).toBe(false);
    expect(c.rowPadding).toBe('px-3 py-1.5');
    expect(c.iconSize).toBe(15);
  });
  it('normalizes junk before resolving', () => {
    expect(densityConfig('whatever').showSubline).toBe(true);
  });
});

describe('toggleDensity', () => {
  it('flips between the two', () => {
    expect(toggleDensity('comfortable')).toBe('compact');
    expect(toggleDensity('compact')).toBe('comfortable');
  });
  it('round-trips', () => {
    expect(toggleDensity(toggleDensity('comfortable'))).toBe('comfortable');
  });
});

describe('otherDensityLabel', () => {
  it('names the destination of a toggle', () => {
    expect(otherDensityLabel('comfortable')).toBe('Compact');
    expect(otherDensityLabel('compact')).toBe('Comfortable');
  });
});
