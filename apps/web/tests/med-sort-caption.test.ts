import { describe, it, expect } from 'vitest';
import {
  medSortPhrase,
  medSortCaption,
  medSortMatchClause,
} from '../lib/med-sort-caption';

describe('medSortPhrase', () => {
  it('phrases each known key', () => {
    expect(medSortPhrase('name')).toBe('name, A to Z');
    expect(medSortPhrase('supply')).toBe('lowest supply first');
    expect(medSortPhrase('runout')).toBe('soonest run-out first');
  });
  it('falls back to the name phrasing for an unknown key', () => {
    // @ts-expect-error - exercising the runtime fallback
    expect(medSortPhrase('bogus')).toBe('name, A to Z');
  });
});

describe('medSortCaption', () => {
  it('builds a full "Sorted by ..." line per key', () => {
    expect(medSortCaption('name')).toBe('Sorted by name, A to Z');
    expect(medSortCaption('supply')).toBe('Sorted by lowest supply first');
    expect(medSortCaption('runout')).toBe('Sorted by soonest run-out first');
  });
  it('reflects the grouped mode regardless of key', () => {
    expect(medSortCaption('name', true)).toBe('Grouped by run-out urgency');
    expect(medSortCaption('supply', true)).toBe('Grouped by run-out urgency');
  });
  it('defaults grouped to false', () => {
    expect(medSortCaption('runout')).toBe('Sorted by soonest run-out first');
  });
});

describe('medSortMatchClause', () => {
  it('is empty when not filtering', () => {
    expect(medSortMatchClause(12, 12, false)).toBe('');
    expect(medSortMatchClause(12, 4, false)).toBe('');
  });
  it('is empty when every med matches', () => {
    expect(medSortMatchClause(12, 12, true)).toBe('');
    expect(medSortMatchClause(5, 9, true)).toBe(''); // shown >= total guard
  });
  it('shows the match clause when a search narrows the list', () => {
    expect(medSortMatchClause(12, 4, true)).toBe(' · 4 of 12 shown');
    expect(medSortMatchClause(3, 1, true)).toBe(' · 1 of 3 shown');
  });
  it('is empty for non-finite inputs', () => {
    expect(medSortMatchClause(Number.NaN, 4, true)).toBe('');
    expect(medSortMatchClause(12, Number.POSITIVE_INFINITY, true)).toBe('');
  });
  it('clamps negative inputs to zero', () => {
    expect(medSortMatchClause(2, -1, true)).toBe(' · 0 of 2 shown');
  });
});
