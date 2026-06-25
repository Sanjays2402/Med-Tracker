import { describe, it, expect } from 'vitest';
import { computeBottleFill, bottleToneVars } from '../lib/bottle-fill';

describe('computeBottleFill', () => {
  it('computes a healthy half-full bottle', () => {
    const b = computeBottleFill(15, 30);
    expect(b.fraction).toBeCloseTo(0.5, 5);
    expect(b.percent).toBe(50);
    expect(b.tone).toBe('ok');
    expect(b.belowThreshold).toBe(false);
  });

  it('turns low (coral) at or under the default 20% threshold', () => {
    const b = computeBottleFill(6, 30); // exactly 20%
    expect(b.belowThreshold).toBe(true);
    expect(b.tone).toBe('low');
  });

  it('respects an explicit lowAt threshold in the same unit', () => {
    const b = computeBottleFill(7, 30, { lowAt: 7 }); // 7 days left, refill at 7
    expect(b.belowThreshold).toBe(true);
    expect(b.tone).toBe('low');
    const healthy = computeBottleFill(8, 30, { lowAt: 7 });
    expect(healthy.belowThreshold).toBe(false);
    expect(healthy.tone).toBe('ok');
  });

  it('reports empty when nothing remains', () => {
    const b = computeBottleFill(0, 30);
    expect(b.fraction).toBe(0);
    expect(b.percent).toBe(0);
    expect(b.tone).toBe('empty');
    expect(b.belowThreshold).toBe(true);
  });

  it('never overflows: caps capacity to remaining', () => {
    const b = computeBottleFill(40, 30);
    expect(b.fraction).toBe(1);
    expect(b.percent).toBe(100);
    expect(b.capacity).toBe(40);
    expect(b.remaining).toBe(40);
  });

  it('clamps negative remaining to zero', () => {
    const b = computeBottleFill(-5, 30);
    expect(b.remaining).toBe(0);
    expect(b.tone).toBe('empty');
  });

  it('handles non-finite inputs without NaN', () => {
    const b = computeBottleFill(Number.NaN, Number.POSITIVE_INFINITY);
    expect(Number.isFinite(b.fraction)).toBe(true);
    expect(b.remaining).toBe(0);
    expect(b.capacity).toBeGreaterThanOrEqual(1);
  });

  it('guards against zero capacity (min capacity of 1)', () => {
    const b = computeBottleFill(0, 0);
    expect(b.capacity).toBe(1);
    expect(b.fraction).toBe(0);
  });
});

describe('bottleToneVars', () => {
  it('maps each tone to liquid + soft vars', () => {
    expect(bottleToneVars('ok').liquid).toBe('var(--accent)');
    expect(bottleToneVars('low').liquid).toBe('var(--danger)');
    expect(bottleToneVars('empty').liquid).toBe('var(--ink-muted)');
  });
});
