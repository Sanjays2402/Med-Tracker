import { describe, it, expect } from 'vitest';
import {
  matchesCaregiver,
  filterCaregivers,
  summarizeCaregiverFilter,
} from '../lib/caregiver-filter';
import type { CaregiverShare } from '../lib/types';

function share(over: Partial<CaregiverShare> & { id: string; label: string }): CaregiverShare {
  return {
    scopes: ['view-meds'],
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: null,
    lastViewedAt: null,
    ...over,
  };
}

const mom = share({ id: 'c_mom', label: 'Mom', scopes: ['view-meds', 'view-adherence'] });
const drLee = share({ id: 'c_lee', label: 'Dr. Lee', scopes: ['view-meds', 'request-refill'] });
const pharmacy = share({ id: 'c_rx', label: 'Corner Pharmacy', scopes: ['view-refills', 'request-refill'] });
const panel = [mom, drLee, pharmacy];

function ids(list: CaregiverShare[]): string[] {
  return list.map((c) => c.id);
}

describe('matchesCaregiver', () => {
  it('matches all on an empty / whitespace query', () => {
    expect(matchesCaregiver(mom, '')).toBe(true);
    expect(matchesCaregiver(mom, '   ')).toBe(true);
  });
  it('matches by label, case-insensitively', () => {
    expect(matchesCaregiver(drLee, 'lee')).toBe(true);
    expect(matchesCaregiver(drLee, 'DR.')).toBe(true);
    expect(matchesCaregiver(drLee, 'pharmacy')).toBe(false);
  });
  it('matches by raw scope token', () => {
    expect(matchesCaregiver(drLee, 'request-refill')).toBe(true);
  });
  it('matches by friendly scope label, not just the slug', () => {
    // "refills" appears in the human label "Request refills" / "View refills".
    expect(matchesCaregiver(pharmacy, 'refills')).toBe(true);
    // "adherence" only hits Mom's view-adherence scope.
    expect(matchesCaregiver(mom, 'adherence')).toBe(true);
    expect(matchesCaregiver(drLee, 'adherence')).toBe(false);
  });
});

describe('filterCaregivers', () => {
  it('returns a copy of all on empty query', () => {
    const out = filterCaregivers(panel, '');
    expect(ids(out)).toEqual(['c_mom', 'c_lee', 'c_rx']);
    expect(out).not.toBe(panel);
  });
  it('narrows by label', () => {
    expect(ids(filterCaregivers(panel, 'mom'))).toEqual(['c_mom']);
  });
  it('narrows by scope across multiple shares', () => {
    // request-refill belongs to Dr. Lee + Pharmacy.
    expect(ids(filterCaregivers(panel, 'request-refill'))).toEqual(['c_lee', 'c_rx']);
  });
  it('preserves input order among survivors', () => {
    expect(ids(filterCaregivers(panel, 'refill'))).toEqual(['c_lee', 'c_rx']);
  });
  it('returns empty when nothing matches', () => {
    expect(filterCaregivers(panel, 'zzz')).toEqual([]);
  });
});

describe('summarizeCaregiverFilter', () => {
  it('reports counts and the filtering flag', () => {
    const s = summarizeCaregiverFilter(panel, 'refill');
    expect(s.matchCount).toBe(2);
    expect(s.total).toBe(3);
    expect(s.filtering).toBe(true);
    expect(ids(s.shares)).toEqual(['c_lee', 'c_rx']);
  });
  it('marks filtering false on an empty query', () => {
    const s = summarizeCaregiverFilter(panel, '   ');
    expect(s.filtering).toBe(false);
    expect(s.matchCount).toBe(3);
    expect(s.total).toBe(3);
  });
});
