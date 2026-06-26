import { describe, it, expect } from 'vitest';
import {
  COUNTABLE_SECTIONS,
  isCountableSection,
  shouldShowCount,
  countLabel,
  totalResultCount,
  resultsSummary,
} from '../lib/section-count';

describe('COUNTABLE_SECTIONS', () => {
  it('covers Pages / Actions / Medications', () => {
    expect([...COUNTABLE_SECTIONS]).toEqual(['Pages', 'Actions', 'Medications']);
  });
});

describe('isCountableSection', () => {
  it('accepts the result sections', () => {
    expect(isCountableSection('Pages')).toBe(true);
    expect(isCountableSection('Actions')).toBe(true);
    expect(isCountableSection('Medications')).toBe(true);
  });
  it('rejects Recent and unknown labels', () => {
    expect(isCountableSection('Recent')).toBe(false);
    expect(isCountableSection('Whatever')).toBe(false);
  });
});

describe('shouldShowCount', () => {
  it('hides counts when the query is empty', () => {
    expect(shouldShowCount('Pages', '', 3)).toBe(false);
    expect(shouldShowCount('Pages', '   ', 3)).toBe(false);
  });
  it('shows counts on a countable section with items while querying', () => {
    expect(shouldShowCount('Pages', 'sch', 2)).toBe(true);
    expect(shouldShowCount('Medications', 'lis', 4)).toBe(true);
  });
  it('never counts the Recent section, even with a query', () => {
    expect(shouldShowCount('Recent', 'lis', 3)).toBe(false);
  });
  it('hides the chip for an empty section', () => {
    expect(shouldShowCount('Actions', 'zzz', 0)).toBe(false);
  });
});

describe('countLabel', () => {
  it('renders the count as a plain string', () => {
    expect(countLabel(12)).toBe('12');
    expect(countLabel(1)).toBe('1');
  });
  it('floors and clamps junk to a non-negative integer', () => {
    expect(countLabel(3.9)).toBe('3');
    expect(countLabel(-5)).toBe('0');
  });
});

describe('totalResultCount', () => {
  it('sums only the countable sections, ignoring Recent', () => {
    const sections = [
      { label: 'Recent', items: [1, 2, 3] },
      { label: 'Pages', items: [1, 2] },
      { label: 'Actions', items: [1] },
      { label: 'Medications', items: [1, 2, 3, 4] },
    ];
    expect(totalResultCount(sections)).toBe(7); // 2 + 1 + 4, Recent excluded
  });
  it('is zero when no countable sections have items', () => {
    expect(totalResultCount([{ label: 'Recent', items: [1, 2] }])).toBe(0);
  });
});

describe('resultsSummary', () => {
  it('pluralises correctly', () => {
    expect(resultsSummary(0)).toBe('No results');
    expect(resultsSummary(1)).toBe('1 result');
    expect(resultsSummary(5)).toBe('5 results');
  });
  it('treats negatives as no results', () => {
    expect(resultsSummary(-1)).toBe('No results');
  });
});
