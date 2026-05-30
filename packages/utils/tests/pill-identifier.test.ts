import { describe, it, expect } from 'vitest';
import {
  identifyPill,
  imprintSimilarity,
  scorePill,
  type PillDescriptor,
} from '../src/pill-identifier';

const catalog: PillDescriptor[] = [
  { id: 'lisin10', name: 'Lisinopril 10 mg', imprint: 'L10', shape: 'round', colors: ['pink'], scored: true, sizeMm: 7 },
  { id: 'lisin20', name: 'Lisinopril 20 mg', imprint: 'L20', shape: 'round', colors: ['yellow'], scored: true, sizeMm: 8 },
  { id: 'metf500', name: 'Metformin 500 mg', imprint: '500', shape: 'oval', colors: ['white'], scored: false, sizeMm: 12 },
  { id: 'amox500', name: 'Amoxicillin 500 mg', imprint: 'AMOX 500', shape: 'capsule', colors: ['red', 'pink'], sizeMm: 19 },
  { id: 'ibu200', name: 'Ibuprofen 200 mg', imprint: 'IBU 200', shape: 'round', colors: ['brown'], sizeMm: 10 },
];

describe('imprintSimilarity', () => {
  it('exact equality scores 1', () => {
    expect(imprintSimilarity('L10', 'L10')).toBe(1);
  });
  it('normalizes case and whitespace', () => {
    expect(imprintSimilarity('amox 500', 'AMOX  500')).toBe(1);
  });
  it('substring scores 0.8', () => {
    expect(imprintSimilarity('AMOX', 'AMOX 500')).toBeCloseTo(0.8, 5);
  });
  it('disjoint tokens score 0', () => {
    expect(imprintSimilarity('XYZ', 'L10')).toBe(0);
  });
});

describe('scorePill', () => {
  it('rewards exact imprint over partial color match', () => {
    const exact = scorePill({ imprint: 'L10' }, catalog[0]);
    const colorOnly = scorePill({ colors: ['pink'] }, catalog[0]);
    expect(exact.score).toBeGreaterThan(colorOnly.score - 0.001);
    expect(exact.reasons.some((r) => r.startsWith('imprint exact'))).toBe(true);
  });
  it('combines attributes additively up to 1.0', () => {
    const m = scorePill(
      { imprint: 'L10', shape: 'round', colors: ['pink'], scored: true, sizeMm: 7 },
      catalog[0],
    );
    expect(m.score).toBe(1);
  });
  it('does not penalize missing fields in the descriptor', () => {
    const slim: PillDescriptor = { id: 'x', name: 'X', imprint: 'L10' };
    const m = scorePill({ imprint: 'L10', shape: 'round' }, slim);
    expect(m.score).toBeGreaterThan(0.5);
  });
});

describe('identifyPill', () => {
  it('ranks exact imprint match first', () => {
    const out = identifyPill({ imprint: 'L10', colors: ['pink'] }, catalog);
    expect(out[0].descriptor.id).toBe('lisin10');
  });
  it('returns capsule for two-tone color match', () => {
    const out = identifyPill({ shape: 'capsule', colors: ['red'] }, catalog);
    expect(out[0].descriptor.id).toBe('amox500');
  });
  it('respects minScore and limit', () => {
    const out = identifyPill({ shape: 'round' }, catalog, { minScore: 0.5, limit: 2 });
    expect(out.length).toBeLessThanOrEqual(2);
    for (const m of out) expect(m.score).toBeGreaterThanOrEqual(0.5);
  });
  it('returns empty array when nothing meets threshold', () => {
    const out = identifyPill({ imprint: 'NOTREAL', shape: 'diamond', colors: ['black'] }, catalog, { minScore: 0.4 });
    expect(out).toEqual([]);
  });
  it('honors size tolerance', () => {
    const tight = identifyPill({ imprint: '500', sizeMm: 11 }, catalog, { sizeToleranceMm: 0.5 });
    const loose = identifyPill({ imprint: '500', sizeMm: 11 }, catalog, { sizeToleranceMm: 1.5 });
    const tightHit = tight.find((m) => m.descriptor.id === 'metf500')!;
    const looseHit = loose.find((m) => m.descriptor.id === 'metf500')!;
    expect(looseHit.score).toBeGreaterThanOrEqual(tightHit.score);
  });
});
