import { describe, it, expect } from 'vitest';
import {
  SECTION_COLLAPSE_STORAGE_KEY,
  isSectionDone,
  sectionDoneSummary,
  normalizeCollapsed,
  parseCollapsed,
  serializeCollapsed,
  toggleCollapsed,
  isCollapsed,
} from '../lib/section-collapse-pref';
import type { PartOfDayCounts } from '../lib/part-of-day';

function counts(p: Partial<PartOfDayCounts>): PartOfDayCounts {
  const { total = 0, taken = 0, skipped = 0, pending = 0 } = p;
  return { total, taken, skipped, pending, done: total > 0 && pending === 0 };
}

describe('section-collapse-pref constants', () => {
  it('has a namespaced storage key', () => {
    expect(SECTION_COLLAPSE_STORAGE_KEY).toBe('medtracker.today.collapsedSections');
  });
});

describe('isSectionDone', () => {
  it('true only when populated and nothing pending', () => {
    expect(isSectionDone(counts({ total: 3, taken: 2, skipped: 1 }))).toBe(true);
    expect(isSectionDone(counts({ total: 3, taken: 2, pending: 1 }))).toBe(false);
    expect(isSectionDone(counts({ total: 0 }))).toBe(false);
  });
});

describe('sectionDoneSummary', () => {
  it('counts taken + skipped as handled', () => {
    expect(sectionDoneSummary(counts({ total: 3, taken: 2, skipped: 1 }))).toBe('3 done');
    expect(sectionDoneSummary(counts({ total: 1, taken: 1 }))).toBe('1 done');
  });
  it('is null when nothing handled', () => {
    expect(sectionDoneSummary(counts({ total: 2, pending: 2 }))).toBeNull();
  });
});

describe('normalizeCollapsed / parse / serialize', () => {
  it('keeps only valid labels', () => {
    expect([...normalizeCollapsed(['Morning', 'Bogus', 'Night'])]).toEqual(['Morning', 'Night']);
    expect([...normalizeCollapsed('nope')]).toEqual([]);
  });
  it('round-trips through serialize/parse in display order', () => {
    const set = new Set(['Night', 'Morning'] as const);
    expect(parseCollapsed(serializeCollapsed(set))).toEqual(new Set(['Morning', 'Night']));
  });
  it('defaults to empty on junk', () => {
    expect([...parseCollapsed('garbage')]).toEqual([]);
    expect([...parseCollapsed(null)]).toEqual([]);
  });
});

describe('toggleCollapsed', () => {
  it('adds and removes without mutating the input', () => {
    const a = new Set(['Morning'] as const);
    const b = toggleCollapsed(a, 'Night');
    expect([...a]).toEqual(['Morning']);
    expect(b.has('Night')).toBe(true);
    expect([...toggleCollapsed(b, 'Morning')]).toEqual(['Night']);
  });
});

describe('isCollapsed', () => {
  it('collapses only a done section the user folded', () => {
    const done = counts({ total: 2, taken: 2 });
    const live = counts({ total: 2, taken: 1, pending: 1 });
    expect(isCollapsed('Morning', done, new Set(['Morning']))).toBe(true);
    expect(isCollapsed('Morning', live, new Set(['Morning']))).toBe(false);
    expect(isCollapsed('Morning', done, new Set())).toBe(false);
  });
});
