import { describe, it, expect } from 'vitest';
import {
  dosesPerDay,
  estimatedDaysLeft,
  matchesQuery,
  filterMedications,
  sortMedications,
  MED_SORTS,
} from '../lib/medication-sort';
import type { Medication } from '../lib/types';

const meds: Medication[] = [
  { id: 'm_a', name: 'Atorvastatin', strength: '20 mg', form: 'tablet', remainingDoses: 6, schedule: '22:00 daily' },
  { id: 'm_l', name: 'Lisinopril', strength: '10 mg', form: 'tablet', remainingDoses: 18, schedule: '08:00 daily' },
  { id: 'm_m', name: 'Metformin', strength: '500 mg', form: 'tablet', remainingDoses: 42, schedule: '08:00, 20:00 daily' },
  { id: 'm_v', name: 'Vitamin D3', strength: '1000 IU', form: 'softgel', remainingDoses: 84, schedule: '08:00 daily' },
];

describe('dosesPerDay', () => {
  it('counts distinct HH:mm tokens', () => {
    expect(dosesPerDay('08:00, 20:00 daily')).toBe(2);
    expect(dosesPerDay('08:00, 14:00, 20:00')).toBe(3);
  });
  it('collapses duplicate times', () => {
    expect(dosesPerDay('08:00, 08:00')).toBe(1);
  });
  it('falls back to 1 when no time tokens', () => {
    expect(dosesPerDay('once daily')).toBe(1);
    expect(dosesPerDay(undefined)).toBe(1);
    expect(dosesPerDay('')).toBe(1);
  });
});

describe('estimatedDaysLeft', () => {
  it('divides remaining doses by doses per day, floored', () => {
    // Metformin: 42 / 2 = 21
    expect(estimatedDaysLeft(meds[2]!)).toBe(21);
    // Atorvastatin: 6 / 1 = 6
    expect(estimatedDaysLeft(meds[0]!)).toBe(6);
  });
  it('returns null when remaining doses is unknown', () => {
    expect(estimatedDaysLeft({ id: 'x', name: 'X' })).toBeNull();
  });
});

describe('matchesQuery', () => {
  it('matches name, strength, and form case-insensitively', () => {
    expect(matchesQuery(meds[0]!, 'ator')).toBe(true);
    expect(matchesQuery(meds[0]!, '20 MG')).toBe(true);
    expect(matchesQuery(meds[3]!, 'softgel')).toBe(true);
  });
  it('empty query matches everything', () => {
    expect(matchesQuery(meds[0]!, '   ')).toBe(true);
  });
  it('non-matching query is false', () => {
    expect(matchesQuery(meds[0]!, 'zzz')).toBe(false);
  });
});

describe('filterMedications', () => {
  it('filters to matching rows', () => {
    expect(filterMedications(meds, 'tablet').map((m) => m.id)).toEqual(['m_a', 'm_l', 'm_m']);
    expect(filterMedications(meds, 'vit').map((m) => m.id)).toEqual(['m_v']);
  });
  it('does not mutate the input', () => {
    const copy = [...meds];
    filterMedications(meds, 'a');
    expect(meds).toEqual(copy);
  });
});

describe('sortMedications', () => {
  it('sorts by name A-Z', () => {
    expect(sortMedications(meds, 'name').map((m) => m.name)).toEqual([
      'Atorvastatin', 'Lisinopril', 'Metformin', 'Vitamin D3',
    ]);
  });
  it('sorts by lowest supply first', () => {
    expect(sortMedications(meds, 'supply').map((m) => m.remainingDoses)).toEqual([6, 18, 42, 84]);
  });
  it('sorts by soonest run-out (estimated days left)', () => {
    // days left: Ator 6, Lisinopril 18, Metformin 21, VitD 84
    expect(sortMedications(meds, 'runout').map((m) => m.id)).toEqual(['m_a', 'm_l', 'm_m', 'm_v']);
  });
  it('pushes unknown supply to the end and tiebreaks by name', () => {
    const withUnknown: Medication[] = [
      { id: 'z', name: 'Zeta' },
      { id: 'a', name: 'Alpha', remainingDoses: 5, schedule: '08:00' },
      { id: 'y', name: 'Yota' },
    ];
    const sorted = sortMedications(withUnknown, 'supply');
    expect(sorted.map((m) => m.id)).toEqual(['a', 'y', 'z']); // a first (has data), then Yota/Zeta by name
  });
  it('does not mutate the input', () => {
    const copy = [...meds];
    sortMedications(meds, 'supply');
    expect(meds).toEqual(copy);
  });
});

describe('MED_SORTS', () => {
  it('exposes three labelled sort options', () => {
    expect(MED_SORTS).toHaveLength(3);
    expect(MED_SORTS.map((s) => s.key)).toEqual(['name', 'supply', 'runout']);
    expect(MED_SORTS.every((s) => s.label.length > 0)).toBe(true);
  });
});
