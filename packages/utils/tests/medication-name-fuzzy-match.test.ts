import { describe, it, expect } from 'vitest';
import type { DrugIndexEntry } from '@med/types';
import {
  bestDrugMatch,
  editDistance,
  fuzzyMatchDrugs,
  normalizeDrugName,
} from '../src/medication-name-fuzzy-match';

const CATALOG: DrugIndexEntry[] = [
  { id: 'd-lisinopril', generic: 'Lisinopril', brand: 'Prinivil', class: 'ACE inhibitor' },
  { id: 'd-metformin', generic: 'Metformin', brand: 'Glucophage', class: 'Biguanide' },
  { id: 'd-acetaminophen', generic: 'Acetaminophen', brand: 'Tylenol', class: 'Analgesic' },
  { id: 'd-aripiprazole', generic: 'Aripiprazole', brand: 'Abilify', class: 'Atypical antipsychotic' },
  { id: 'd-atorvastatin', generic: 'Atorvastatin', brand: 'Lipitor', class: 'Statin' },
  { id: 'd-amoxicillin', generic: 'Amoxicillin', brand: 'Amoxil', class: 'Penicillin antibiotic' },
  { id: 'd-warfarin', generic: 'Warfarin', brand: 'Coumadin', class: 'Anticoagulant' },
];

describe('normalizeDrugName', () => {
  it('lowercases and strips suffix noise', () => {
    expect(normalizeDrugName('Metformin HCL ER')).toBe('metformin');
    expect(normalizeDrugName('Glucophage XR Tablet')).toBe('glucophage');
  });

  it('preserves multi-word names but collapses spaces', () => {
    expect(normalizeDrugName('  amoxicillin   clavulanate ')).toBe('amoxicillin clavulanate');
  });
});

describe('editDistance', () => {
  it('returns 0 for equal strings', () => {
    expect(editDistance('lisinopril', 'lisinopril')).toBe(0);
  });

  it('counts substitution as 1', () => {
    expect(editDistance('lisinopril', 'lisinapril')).toBe(1);
  });

  it('counts an insertion as 1', () => {
    expect(editDistance('aspirin', 'aspirine')).toBe(1);
  });

  it('counts a deletion as 1', () => {
    expect(editDistance('aspirine', 'aspirin')).toBe(1);
  });

  it('treats adjacent transposition as a single edit (Damerau)', () => {
    expect(editDistance('metforimn', 'metformin')).toBe(1);
    expect(editDistance('teh', 'the')).toBe(1);
  });

  it('handles empty input gracefully', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
    expect(editDistance('', '')).toBe(0);
  });
});

describe('fuzzyMatchDrugs', () => {
  it('returns exact match first when query equals the generic name', () => {
    const r = fuzzyMatchDrugs('lisinopril', CATALOG);
    expect(r[0]?.drugId).toBe('d-lisinopril');
    expect(r[0]?.exact).toBe(true);
    expect(r[0]?.score).toBe(1);
    expect(r[0]?.matchedField).toBe('generic');
  });

  it('tolerates a single-character substitution', () => {
    const r = fuzzyMatchDrugs('lisinapril', CATALOG);
    expect(r[0]?.drugId).toBe('d-lisinopril');
    expect(r[0]?.distance).toBe(1);
    expect(r[0]?.score).toBeGreaterThan(0.8);
  });

  it('resolves a Damerau transposition into the right drug', () => {
    const r = fuzzyMatchDrugs('metforimn', CATALOG);
    expect(r[0]?.drugId).toBe('d-metformin');
    expect(r[0]?.distance).toBe(1);
  });

  it('resolves brand-to-generic', () => {
    const r = fuzzyMatchDrugs('tylenol', CATALOG);
    expect(r[0]?.drugId).toBe('d-acetaminophen');
    expect(r[0]?.matchedField).toBe('brand');
    expect(r[0]?.exact).toBe(true);
  });

  it('resolves generic-to-brand by returning the same drug', () => {
    const r = fuzzyMatchDrugs('acetaminophen', CATALOG);
    expect(r[0]?.drugId).toBe('d-acetaminophen');
    expect(r[0]?.matchedField).toBe('generic');
  });

  it('strips dosage-form suffixes before matching', () => {
    const r = fuzzyMatchDrugs('Metformin XR', CATALOG);
    expect(r[0]?.drugId).toBe('d-metformin');
    expect(r[0]?.exact).toBe(true);
  });

  it('respects the limit option', () => {
    const r = fuzzyMatchDrugs('a', CATALOG, { limit: 3, minScore: 0 });
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it('returns an empty list when nothing meets the score floor', () => {
    const r = fuzzyMatchDrugs('zxqvbnm', CATALOG);
    expect(r).toEqual([]);
  });

  it('returns an empty list for an empty or whitespace query', () => {
    expect(fuzzyMatchDrugs('', CATALOG)).toEqual([]);
    expect(fuzzyMatchDrugs('   ', CATALOG)).toEqual([]);
  });

  it('prefers a prefix match when prefixBonus is on (default)', () => {
    const r = fuzzyMatchDrugs('lis', CATALOG, { minScore: 0 });
    expect(r[0]?.drugId).toBe('d-lisinopril');
  });

  it('does not let class outrank a real generic/brand match', () => {
    // 'Statin' is the class for atorvastatin; query is a real generic.
    const r = fuzzyMatchDrugs('atorvastatin', CATALOG);
    expect(r[0]?.drugId).toBe('d-atorvastatin');
    expect(r[0]?.matchedField).toBe('generic');
  });

  it('sorts ties by distance then alphabetically by generic', () => {
    // 'amox' should rank amoxicillin first (prefix match wins).
    const r = fuzzyMatchDrugs('amox', CATALOG, { minScore: 0.3 });
    expect(r[0]?.drugId).toBe('d-amoxicillin');
  });

  it('ranks an exact brand match above a weak generic neighbour', () => {
    const r = fuzzyMatchDrugs('Coumadin', CATALOG);
    expect(r[0]?.drugId).toBe('d-warfarin');
    expect(r[0]?.matchedField).toBe('brand');
  });
});

describe('bestDrugMatch', () => {
  it('returns the single best match above the accept threshold', () => {
    expect(bestDrugMatch('lisinopril', CATALOG)?.drugId).toBe('d-lisinopril');
  });

  it('returns null when no match clears the high-confidence threshold', () => {
    expect(bestDrugMatch('lis', CATALOG)).toBeNull();
  });

  it('lets callers lower the accept threshold for typo-tolerant entry', () => {
    // Two edits on a 9-char generic land around 0.78 score, below the
    // default 0.8 accept threshold but above 0.6.
    expect(bestDrugMatch('metforman', CATALOG)).not.toBeNull();
    expect(bestDrugMatch('metfornin', CATALOG, 0.6)?.drugId).toBe('d-metformin');
  });

  it('preserves the matched field on the single result', () => {
    expect(bestDrugMatch('tylenol', CATALOG)?.matchedField).toBe('brand');
  });
});
