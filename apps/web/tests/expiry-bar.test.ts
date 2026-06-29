import { describe, it, expect } from 'vitest';
import { expiryBar, expirySegmentTooltip, expiryBarAriaDescription, expirySegmentAriaLabel, allActiveLegend, activeBarTooltip, activeCountPill } from '../lib/expiry-bar';
import type { ExpirySummary } from '../lib/caregiver-expiry';

function summary(over: Partial<ExpirySummary>): ExpirySummary {
  return { total: 0, soon: 0, expired: 0, active: 0, noExpiry: 0, ...over };
}

describe('expiryBar', () => {
  it('is null when there are no shares', () => {
    expect(expiryBar(summary({}))).toBeNull();
  });

  it('folds no-expiry shares into the active segment', () => {
    const bar = expiryBar(summary({ active: 2, noExpiry: 3, total: 5 }))!;
    expect(bar.total).toBe(5);
    const active = bar.segments.find((s) => s.kind === 'active')!;
    expect(active.count).toBe(5);
    expect(active.pct).toBe(100);
    expect(active.tone).toBe('ok');
    expect(bar.hasRisk).toBe(false);
  });

  it('splits active / soon / expired with tones', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, expired: 1, total: 4 }))!;
    expect(bar.segments.map((s) => s.kind)).toEqual(['active', 'soon', 'expired']);
    expect(bar.segments.map((s) => s.tone)).toEqual(['ok', 'warn', 'danger']);
    expect(bar.segments.map((s) => s.pct)).toEqual([50, 25, 25]);
    expect(bar.hasRisk).toBe(true);
  });

  it('drops empty buckets from the segment list', () => {
    const bar = expiryBar(summary({ soon: 1, expired: 1, total: 2 }))!;
    expect(bar.segments.map((s) => s.kind)).toEqual(['soon', 'expired']);
    expect(bar.segments.every((s) => s.count > 0)).toBe(true);
  });

  it('rounds widths so they sum to exactly 100', () => {
    // 1 / 1 / 1 -> exact 33.33 each; largest-remainder hands the leftover unit
    // to the first bucket by fractional tie-break, so widths are 34/33/33 = 100.
    const bar = expiryBar(summary({ active: 1, soon: 1, expired: 1, total: 3 }))!;
    const sum = bar.segments.reduce((a, s) => a + s.pct, 0);
    expect(sum).toBe(100);
    expect(bar.segments.map((s) => s.pct)).toEqual([34, 33, 33]);
  });

  it('keeps widths summing to 100 with a lopsided split', () => {
    const bar = expiryBar(summary({ active: 7, soon: 1, expired: 1, total: 9 }))!;
    const sum = bar.segments.reduce((a, s) => a + s.pct, 0);
    expect(sum).toBe(100);
  });

  it('pluralises the expired label', () => {
    const one = expiryBar(summary({ active: 1, expired: 1, total: 2 }))!;
    expect(one.segments.find((s) => s.kind === 'expired')!.label).toBe('1 expired');
    const many = expiryBar(summary({ active: 1, expired: 3, total: 4 }))!;
    expect(many.segments.find((s) => s.kind === 'expired')!.label).toBe('3 expired');
  });

  it('labels the soon and active segments', () => {
    const bar = expiryBar(summary({ active: 4, soon: 2, total: 6 }))!;
    expect(bar.segments.find((s) => s.kind === 'active')!.label).toBe('4 active');
    expect(bar.segments.find((s) => s.kind === 'soon')!.label).toBe('2 expiring soon');
  });

  it('hasRisk is false for an all-active list', () => {
    expect(expiryBar(summary({ active: 5, total: 5 }))!.hasRisk).toBe(false);
  });

  it('hasRisk is true when only expired shares exist', () => {
    expect(expiryBar(summary({ expired: 2, total: 2 }))!.hasRisk).toBe(true);
  });
});

describe('expirySegmentTooltip', () => {
  it('names the soon segment with the window and total', () => {
    expect(expirySegmentTooltip({ kind: 'soon', count: 3 }, 6)).toBe(
      '3 of 6 shares expiring within 7 days',
    );
  });

  it('names the active segment', () => {
    expect(expirySegmentTooltip({ kind: 'active', count: 4 }, 6)).toBe('4 of 6 shares active');
  });

  it('names the expired segment', () => {
    expect(expirySegmentTooltip({ kind: 'expired', count: 1 }, 6)).toBe('1 of 6 shares expired');
  });

  it('uses a custom soon window when given', () => {
    expect(expirySegmentTooltip({ kind: 'soon', count: 2 }, 5, 14)).toBe(
      '2 of 5 shares expiring within 14 days',
    );
  });

  it('uses the singular noun for a one-share list', () => {
    expect(expirySegmentTooltip({ kind: 'active', count: 1 }, 1)).toBe('1 of 1 share active');
  });

  it('matches the bar total so the context is honest', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, expired: 1, total: 4 }))!;
    const soon = bar.segments.find((s) => s.kind === 'soon')!;
    expect(expirySegmentTooltip(soon, bar.total)).toBe('1 of 4 shares expiring within 7 days');
  });
});

describe('expiryBarAriaDescription', () => {
  it('names each segment percentage in order', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, expired: 1, total: 4 }))!;
    expect(expiryBarAriaDescription(bar)).toBe('50% active, 25% expiring soon, 25% expired');
  });

  it('only names non-empty segments', () => {
    const bar = expiryBar(summary({ soon: 1, expired: 1, total: 2 }))!;
    expect(expiryBarAriaDescription(bar)).toBe('50% expiring soon, 50% expired');
  });

  it('reads an all-active bar as a single 100% phrase', () => {
    const bar = expiryBar(summary({ active: 3, noExpiry: 2, total: 5 }))!;
    expect(expiryBarAriaDescription(bar)).toBe('100% active');
  });

  it('uses the same widths the bar draws so the two never disagree', () => {
    const bar = expiryBar(summary({ active: 1, soon: 1, expired: 1, total: 3 }))!;
    // widths are 34/33/33 (largest-remainder).
    expect(expiryBarAriaDescription(bar)).toBe('34% active, 33% expiring soon, 33% expired');
    // The phrase percentages sum to the same 100 the widths do.
    const sum = bar.segments.reduce((a, s) => a + s.pct, 0);
    expect(sum).toBe(100);
  });
});

describe('allActiveLegend', () => {
  it('is null when the bar has something at risk', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, total: 3 }))!;
    expect(bar.hasRisk).toBe(true);
    expect(allActiveLegend(bar)).toBeNull();
  });

  it('vouches for an all-active list, pluralising on the total', () => {
    const bar = expiryBar(summary({ active: 3, noExpiry: 1, total: 4 }))!;
    expect(bar.hasRisk).toBe(false);
    expect(allActiveLegend(bar)).toBe('All 4 shares active');
  });

  it('uses singular phrasing for a single share', () => {
    const bar = expiryBar(summary({ active: 1, total: 1 }))!;
    expect(allActiveLegend(bar)).toBe('The 1 share is active');
  });

  it('counts no-expiry shares into the active total it vouches for', () => {
    const bar = expiryBar(summary({ noExpiry: 2, total: 2 }))!;
    expect(allActiveLegend(bar)).toBe('All 2 shares active');
  });
});

describe('activeBarTooltip', () => {
  it('names the active count over the total for a tidy list', () => {
    const bar = expiryBar(summary({ active: 3, noExpiry: 1, total: 4 }))!;
    expect(activeBarTooltip(bar)).toBe('4 of 4 shares active');
  });
  it('pluralises for a single share', () => {
    const bar = expiryBar(summary({ active: 1, total: 1 }))!;
    expect(activeBarTooltip(bar)).toBe('1 of 1 share active');
  });
  it('is null when the bar has risk (coloured segments speak for themselves)', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, total: 3 }))!;
    expect(activeBarTooltip(bar)).toBeNull();
  });
});


describe('expirySegmentAriaLabel', () => {
  it('pairs the segment percentage with its share of the whole list', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, expired: 1, total: 4 }))!;
    const soon = bar.segments.find((s) => s.kind === 'soon')!;
    expect(expirySegmentAriaLabel(soon, bar.total)).toBe('25% expiring soon, 1 of 4 shares');
  });

  it('names the active and expired segments', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, expired: 1, total: 4 }))!;
    const active = bar.segments.find((s) => s.kind === 'active')!;
    const expired = bar.segments.find((s) => s.kind === 'expired')!;
    expect(expirySegmentAriaLabel(active, bar.total)).toBe('50% active, 2 of 4 shares');
    expect(expirySegmentAriaLabel(expired, bar.total)).toBe('25% expired, 1 of 4 shares');
  });

  it('uses the singular noun for a one-share list', () => {
    const bar = expiryBar(summary({ soon: 1, total: 1 }))!;
    const soon = bar.segments.find((s) => s.kind === 'soon')!;
    expect(expirySegmentAriaLabel(soon, bar.total)).toBe('100% expiring soon, 1 of 1 share');
  });

  it('uses the same percentage the bar draws so it never disagrees', () => {
    const bar = expiryBar(summary({ active: 1, soon: 1, expired: 1, total: 3 }))!;
    // widths are 34/33/33 (largest-remainder); the aria label reads the same.
    const active = bar.segments.find((s) => s.kind === 'active')!;
    expect(expirySegmentAriaLabel(active, bar.total)).toBe('34% active, 1 of 3 shares');
  });
});

describe('activeCountPill', () => {
  it('names the active total for an all-good bar', () => {
    const bar = expiryBar(summary({ active: 3, noExpiry: 1, total: 4 }))!;
    expect(activeCountPill(bar)).toBe('4 active');
  });
  it('is null when the bar has risk', () => {
    const bar = expiryBar(summary({ active: 2, soon: 1, total: 3 }))!;
    expect(activeCountPill(bar)).toBeNull();
  });
});
