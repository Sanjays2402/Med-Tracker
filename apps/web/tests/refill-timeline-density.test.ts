import { describe, it, expect } from 'vitest';
import {
  STRIP_DENSITY_STORAGE_KEY,
  DEFAULT_STRIP_DENSITY,
  STRIP_DENSITY_OPTIONS,
  normalizeStripDensity,
  parseStripDensity,
  serializeStripDensity,
  stripDensityConfig,
  toggleStripDensity,
  otherStripDensityLabel,
  stripDensityLabel,
  stripDensityAnnouncement,
  stripDensityDescription,
  trackHeight,
} from '../lib/refill-timeline-density';

describe('refill-timeline-density constants', () => {
  it('has a namespaced storage key and a comfortable default', () => {
    expect(STRIP_DENSITY_STORAGE_KEY).toBe('medtracker.refills.timelineDensity');
    expect(DEFAULT_STRIP_DENSITY).toBe('comfortable');
  });
  it('lists both options with labels', () => {
    expect(STRIP_DENSITY_OPTIONS.map((o) => o.value)).toEqual(['comfortable', 'compact']);
    expect(STRIP_DENSITY_OPTIONS.map((o) => o.label)).toEqual(['Comfortable', 'Compact']);
  });
});

describe('normalizeStripDensity', () => {
  it('passes through valid values', () => {
    expect(normalizeStripDensity('comfortable')).toBe('comfortable');
    expect(normalizeStripDensity('compact')).toBe('compact');
  });
  it('falls back to the default for junk', () => {
    expect(normalizeStripDensity('roomy')).toBe('comfortable');
    expect(normalizeStripDensity(null)).toBe('comfortable');
    expect(normalizeStripDensity(3)).toBe('comfortable');
  });
});

describe('parseStripDensity', () => {
  it('parses bare and JSON-quoted tokens', () => {
    expect(parseStripDensity('compact')).toBe('compact');
    expect(parseStripDensity('"compact"')).toBe('compact');
    expect(parseStripDensity('comfortable')).toBe('comfortable');
  });
  it('defaults on empty / missing / bad input', () => {
    expect(parseStripDensity(null)).toBe('comfortable');
    expect(parseStripDensity('')).toBe('comfortable');
    expect(parseStripDensity('garbage')).toBe('comfortable');
  });
  it('round-trips through serialize', () => {
    expect(parseStripDensity(serializeStripDensity('compact'))).toBe('compact');
    expect(parseStripDensity(serializeStripDensity('comfortable'))).toBe('comfortable');
  });
});

describe('stripDensityConfig', () => {
  it('comfortable spaces lanes wider than compact', () => {
    expect(stripDensityConfig('comfortable').laneSpacing).toBe(30);
    expect(stripDensityConfig('compact').laneSpacing).toBe(20);
    expect(stripDensityConfig('compact').laneSpacing).toBeLessThan(stripDensityConfig('comfortable').laneSpacing);
  });
  it('normalizes bad input to the default config', () => {
    expect(stripDensityConfig('junk')).toEqual(stripDensityConfig('comfortable'));
  });
});

describe('toggleStripDensity / otherStripDensityLabel', () => {
  it('flips between the two', () => {
    expect(toggleStripDensity('comfortable')).toBe('compact');
    expect(toggleStripDensity('compact')).toBe('comfortable');
  });
  it('labels the destination', () => {
    expect(otherStripDensityLabel('comfortable')).toBe('Compact');
    expect(otherStripDensityLabel('compact')).toBe('Comfortable');
  });
});

describe('trackHeight', () => {
  it('is shorter for compact at the same lane count', () => {
    expect(trackHeight(3, 'compact')).toBeLessThan(trackHeight(3, 'comfortable'));
  });
  it('matches trackPad + lanes * laneSpacing', () => {
    expect(trackHeight(3, 'comfortable')).toBe(14 + 3 * 30);
    expect(trackHeight(3, 'compact')).toBe(10 + 3 * 20);
  });
  it('reserves at least one lane for empty / bad counts', () => {
    expect(trackHeight(0, 'comfortable')).toBe(14 + 30);
    expect(trackHeight(NaN, 'compact')).toBe(10 + 20);
  });
});

describe('stripDensityLabel', () => {
  it('names the current spacing', () => {
    expect(stripDensityLabel('comfortable')).toBe('Comfortable');
    expect(stripDensityLabel('compact')).toBe('Compact');
  });
});

describe('stripDensityAnnouncement', () => {
  it('pairs current spacing with the destination of the next press', () => {
    expect(stripDensityAnnouncement('comfortable')).toBe('Comfortable spacing, switch to compact');
    expect(stripDensityAnnouncement('compact')).toBe('Compact spacing, switch to comfortable');
  });
});

describe('stripDensityDescription', () => {
  it('gives a one-line description for each option', () => {
    expect(stripDensityDescription('comfortable')).toBe('Roomy lane spacing, easier labels');
    expect(stripDensityDescription('compact')).toBe('Tighter lanes, fits more in less height');
  });
  it('falls back to the default option for unknown input', () => {
    expect(stripDensityDescription('bogus')).toBe('Roomy lane spacing, easier labels');
    expect(stripDensityDescription(null)).toBe('Roomy lane spacing, easier labels');
  });
  it('every option carries a non-empty description', () => {
    expect(STRIP_DENSITY_OPTIONS.every((o) => o.description.length > 0)).toBe(true);
  });
});
