import { describe, it, expect } from 'vitest';
import { computeBreakdown } from '../lib/adherence-breakdown';

describe('computeBreakdown — counts', () => {
  it('treats every not-taken dose as missed when no skipped count given', () => {
    const b = computeBreakdown({ taken: 156, scheduled: 168 });
    expect(b.taken).toBe(156);
    expect(b.skipped).toBe(0);
    expect(b.missed).toBe(12);
  });
  it('splits the remainder into skipped + missed when skipped given', () => {
    const b = computeBreakdown({ taken: 156, scheduled: 168, skipped: 5 });
    expect(b.skipped).toBe(5);
    expect(b.missed).toBe(7);
  });
  it('clamps taken to scheduled', () => {
    const b = computeBreakdown({ taken: 200, scheduled: 168 });
    expect(b.taken).toBe(168);
    expect(b.missed).toBe(0);
  });
  it('clamps skipped into the not-taken remainder', () => {
    const b = computeBreakdown({ taken: 160, scheduled: 168, skipped: 99 });
    expect(b.skipped).toBe(8);
    expect(b.missed).toBe(0);
  });
});

describe('computeBreakdown — percentages', () => {
  it('adherencePct rounds taken/scheduled', () => {
    expect(computeBreakdown({ taken: 156, scheduled: 168 }).adherencePct).toBe(93);
    expect(computeBreakdown({ taken: 1, scheduled: 3 }).adherencePct).toBe(33);
  });
  it('segment percents sum to exactly 100 (largest remainder)', () => {
    const b = computeBreakdown({ taken: 1, scheduled: 3, skipped: 1 });
    const total = b.segments.reduce((a, s) => a + s.percent, 0);
    expect(total).toBe(100);
  });
  it('segment percents sum to 100 on an awkward split', () => {
    const b = computeBreakdown({ taken: 100, scheduled: 168, skipped: 34 });
    const total = b.segments.reduce((a, s) => a + s.percent, 0);
    expect(total).toBe(100);
  });
});

describe('computeBreakdown — segments', () => {
  it('emits taken, skipped, missed in order', () => {
    const b = computeBreakdown({ taken: 10, scheduled: 20, skipped: 4 });
    expect(b.segments.map((s) => s.kind)).toEqual(['taken', 'skipped', 'missed']);
    expect(b.segments.map((s) => s.count)).toEqual([10, 4, 6]);
  });
  it('fractions are shares of scheduled', () => {
    const b = computeBreakdown({ taken: 10, scheduled: 20 });
    expect(b.segments[0]!.fraction).toBeCloseTo(0.5, 6);
  });
});

describe('computeBreakdown — edge cases', () => {
  it('handles a zero-scheduled window', () => {
    const b = computeBreakdown({ taken: 0, scheduled: 0 });
    expect(b.adherencePct).toBe(0);
    expect(b.segments.every((s) => s.percent === 0 && s.fraction === 0)).toBe(true);
  });
  it('sanitizes non-finite input', () => {
    const b = computeBreakdown({ taken: NaN, scheduled: Infinity });
    expect(b.scheduled).toBe(0);
    expect(b.taken).toBe(0);
  });
  it('floors fractional counts', () => {
    const b = computeBreakdown({ taken: 10.9, scheduled: 20.9 });
    expect(b.taken).toBe(10);
    expect(b.scheduled).toBe(20);
  });
});
