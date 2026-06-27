import { describe, it, expect } from 'vitest';
import {
  caregiverSortPhrase,
  caregiverSortCaption,
  caregiverSortMatchClause,
} from '../lib/caregiver-sort-caption';

describe('caregiverSortPhrase', () => {
  it('phrases each known key', () => {
    expect(caregiverSortPhrase('recent')).toBe('most recently viewed');
    expect(caregiverSortPhrase('stale')).toBe('least recently viewed');
    expect(caregiverSortPhrase('never-first')).toBe('never opened first');
    expect(caregiverSortPhrase('expiry')).toBe('expiring soonest');
  });
  it('falls back to the recent phrasing for an unknown key', () => {
    // @ts-expect-error - exercising the runtime fallback
    expect(caregiverSortPhrase('bogus')).toBe('most recently viewed');
  });
});

describe('caregiverSortCaption', () => {
  it('builds a full "Sorted by ..." line per key', () => {
    expect(caregiverSortCaption('recent')).toBe('Sorted by most recently viewed');
    expect(caregiverSortCaption('stale')).toBe('Sorted by least recently viewed');
    expect(caregiverSortCaption('never-first')).toBe('Sorted by never opened first');
    expect(caregiverSortCaption('expiry')).toBe('Sorted by expiring soonest');
  });
});

describe('caregiverSortMatchClause', () => {
  it('is empty when not filtering', () => {
    expect(caregiverSortMatchClause(5, 5, false)).toBe('');
    expect(caregiverSortMatchClause(5, 2, false)).toBe('');
  });
  it('is empty when every share matches', () => {
    expect(caregiverSortMatchClause(5, 5, true)).toBe('');
    expect(caregiverSortMatchClause(3, 9, true)).toBe(''); // shown >= total guard
  });
  it('shows the match clause when a search narrows the list', () => {
    expect(caregiverSortMatchClause(5, 2, true)).toBe(' · 2 of 5 shown');
    expect(caregiverSortMatchClause(3, 1, true)).toBe(' · 1 of 3 shown');
  });
  it('is empty for non-finite inputs', () => {
    expect(caregiverSortMatchClause(Number.NaN, 2, true)).toBe('');
    expect(caregiverSortMatchClause(5, Number.POSITIVE_INFINITY, true)).toBe('');
  });
  it('clamps negative inputs to zero', () => {
    expect(caregiverSortMatchClause(2, -1, true)).toBe(' · 0 of 2 shown');
  });
});
