import { describe, it, expect } from 'vitest';
import { expiryBar } from '../lib/expiry-bar';
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
