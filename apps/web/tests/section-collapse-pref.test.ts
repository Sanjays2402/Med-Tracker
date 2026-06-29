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
  doneLabels,
  canCollapseAllDone,
  toggleAllDone,
  collapseAllLabel,
  newlyFoldedCount,
  foldedToastTitle,
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

const live = counts({ total: 2, taken: 1, pending: 1 });
const done2 = counts({ total: 2, taken: 2 });
const empty = counts({});
const sections = (m: PartOfDayCounts, a: PartOfDayCounts, e: PartOfDayCounts, n: PartOfDayCounts) =>
  [
    { label: 'Morning' as const, counts: m },
    { label: 'Afternoon' as const, counts: a },
    { label: 'Evening' as const, counts: e },
    { label: 'Night' as const, counts: n },
  ];

describe('doneLabels', () => {
  it('lists only sections with doses, all acted on', () => {
    expect(doneLabels(sections(done2, live, done2, empty))).toEqual(['Morning', 'Evening']);
    expect(doneLabels(sections(empty, empty, empty, empty))).toEqual([]);
  });
});

describe('canCollapseAllDone', () => {
  it('true when some done section is still expanded', () => {
    expect(canCollapseAllDone(sections(done2, live, empty, empty), new Set())).toBe(true);
  });
  it('false when every done section is already folded', () => {
    expect(canCollapseAllDone(sections(done2, live, empty, empty), new Set(['Morning']))).toBe(false);
  });
  it('false when nothing is done', () => {
    expect(canCollapseAllDone(sections(live, empty, empty, empty), new Set())).toBe(false);
  });
});

describe('toggleAllDone', () => {
  it('folds every done section when any is open', () => {
    const next = toggleAllDone(sections(done2, done2, live, empty), new Set());
    expect([...next].sort()).toEqual(['Afternoon', 'Morning']);
  });
  it('unfolds all when everything done is already folded', () => {
    const next = toggleAllDone(sections(done2, done2, live, empty), new Set(['Morning', 'Afternoon']));
    expect([...next]).toEqual([]);
  });
  it('removes done labels on unfold; harmless stale non-done labels remain gated', () => {
    const next = toggleAllDone(sections(done2, empty, empty, empty), new Set(['Morning', 'Night']));
    expect(next.has('Morning')).toBe(false);
  });
});

describe('newlyFoldedCount', () => {
  it('counts done sections not already folded', () => {
    expect(newlyFoldedCount(sections(done2, done2, live, empty), new Set())).toBe(2);
    expect(newlyFoldedCount(sections(done2, done2, live, empty), new Set(['Morning']))).toBe(1);
  });
  it('is zero when everything done is already folded (the next tap un-folds)', () => {
    expect(newlyFoldedCount(sections(done2, done2, live, empty), new Set(['Morning', 'Afternoon']))).toBe(0);
  });
  it('is zero when nothing is done', () => {
    expect(newlyFoldedCount(sections(live, empty, empty, empty), new Set())).toBe(0);
  });
});

describe('foldedToastTitle', () => {
  it('pluralises the folded count', () => {
    expect(foldedToastTitle(3)).toBe('Folded 3 finished sections');
    expect(foldedToastTitle(1)).toBe('Folded 1 finished section');
  });
  it('is null when nothing was folded', () => {
    expect(foldedToastTitle(0)).toBeNull();
    expect(foldedToastTitle(-2)).toBeNull();
  });
});

describe('collapseAllLabel', () => {
  it('names Collapse done when foldable, Expand done when all folded, null when none', () => {
    expect(collapseAllLabel(sections(done2, live, empty, empty), new Set())).toBe('Collapse done');
    expect(collapseAllLabel(sections(done2, live, empty, empty), new Set(['Morning']))).toBe('Expand done');
    expect(collapseAllLabel(sections(live, empty, empty, empty), new Set())).toBeNull();
  });
});
