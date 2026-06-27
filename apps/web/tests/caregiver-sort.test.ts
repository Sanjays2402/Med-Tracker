import { describe, it, expect } from 'vitest';
import {
  CAREGIVER_SORTS,
  CAREGIVER_SORT_KEYS,
  cycleCaregiverSort,
  lastViewedAt,
  daysSinceViewed,
  sortCaregivers,
  summarizeCaregiverSort,
  type CaregiverSortKey,
} from '../lib/caregiver-sort';
import type { CaregiverShare } from '../lib/types';

const NOW = Date.parse('2026-06-25T12:00:00Z');

function share(over: Partial<CaregiverShare> & { id: string; label: string }): CaregiverShare {
  return {
    scopes: ['view-meds'],
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: null,
    lastViewedAt: null,
    ...over,
  };
}

// A small panel: viewed today, viewed a week ago, viewed an hour ago, never.
const today = share({ id: 'c_today', label: 'Mom', lastViewedAt: '2026-06-25T08:00:00Z' });
const weekAgo = share({ id: 'c_week', label: 'Dr. Lee', lastViewedAt: '2026-06-18T08:00:00Z' });
const hourAgo = share({ id: 'c_hour', label: 'Pharmacy', lastViewedAt: '2026-06-25T11:00:00Z' });
const never = share({ id: 'c_never', label: 'Aunt May', lastViewedAt: null });
const panel = [today, weekAgo, hourAgo, never];

function ids(list: CaregiverShare[]): string[] {
  return list.map((c) => c.id);
}

describe('CAREGIVER_SORTS', () => {
  it('exposes four sort options', () => {
    expect(CAREGIVER_SORTS.map((o) => o.key)).toEqual<CaregiverSortKey[]>([
      'recent',
      'stale',
      'never-first',
      'expiry',
    ]);
  });
});

describe('lastViewedAt', () => {
  it('returns epoch ms for a viewed share', () => {
    expect(lastViewedAt(today)).toBe(Date.parse('2026-06-25T08:00:00Z'));
  });
  it('returns null when never viewed or unparseable', () => {
    expect(lastViewedAt(never)).toBeNull();
    expect(lastViewedAt(share({ id: 'x', label: 'X', lastViewedAt: 'nonsense' }))).toBeNull();
  });
});

describe('daysSinceViewed', () => {
  it('counts whole days since the last view', () => {
    expect(daysSinceViewed(weekAgo, NOW)).toBe(7);
    expect(daysSinceViewed(hourAgo, NOW)).toBe(0);
  });
  it('is null for a never-viewed share', () => {
    expect(daysSinceViewed(never, NOW)).toBeNull();
  });
  it('clamps a future view to 0', () => {
    const future = share({ id: 'f', label: 'F', lastViewedAt: '2026-06-26T00:00:00Z' });
    expect(daysSinceViewed(future, NOW)).toBe(0);
  });
});

describe('sortCaregivers', () => {
  it('recent: newest view first, never-viewed last', () => {
    expect(ids(sortCaregivers(panel, 'recent', NOW))).toEqual([
      'c_hour',
      'c_today',
      'c_week',
      'c_never',
    ]);
  });
  it('stale: oldest view first, never-viewed last', () => {
    expect(ids(sortCaregivers(panel, 'stale', NOW))).toEqual([
      'c_week',
      'c_today',
      'c_hour',
      'c_never',
    ]);
  });
  it('never-first: unopened on top, then newest-viewed', () => {
    expect(ids(sortCaregivers(panel, 'never-first', NOW))).toEqual([
      'c_never',
      'c_hour',
      'c_today',
      'c_week',
    ]);
  });
  it('does not mutate the input array', () => {
    const copy = [...panel];
    sortCaregivers(panel, 'recent', NOW);
    expect(panel).toEqual(copy);
  });
  it('breaks ties by label A-Z (two never-viewed)', () => {
    const a = share({ id: 'z', label: 'Zoe' });
    const b = share({ id: 'a', label: 'Abe' });
    expect(ids(sortCaregivers([a, b], 'recent', NOW))).toEqual(['a', 'z']);
    expect(ids(sortCaregivers([a, b], 'never-first', NOW))).toEqual(['a', 'z']);
  });
  it('handles an empty list', () => {
    expect(sortCaregivers([], 'recent', NOW)).toEqual([]);
  });
});

describe('sortCaregivers — expiry', () => {
  // Expiry panel: expired 2 days ago, expires today, expires in 10 days, none.
  const expired = share({ id: 'e_past', label: 'Expired', expiresAt: '2026-06-23T12:00:00Z' });
  const todayExp = share({ id: 'e_today', label: 'Today', expiresAt: '2026-06-25T18:00:00Z' });
  const soon = share({ id: 'e_soon', label: 'Soon', expiresAt: '2026-07-05T12:00:00Z' });
  const noExp = share({ id: 'e_none', label: 'NoExpiry', expiresAt: null });
  const expiryPanel = [soon, noExp, expired, todayExp];

  it('orders soonest expiry first, no-expiry last', () => {
    expect(ids(sortCaregivers(expiryPanel, 'expiry', NOW))).toEqual([
      'e_past', // already expired (most negative)
      'e_today', // expires today
      'e_soon', // expires in 10 days
      'e_none', // no expiry sinks to the bottom
    ]);
  });

  it('breaks ties on equal expiry by label A-Z', () => {
    const z = share({ id: 'z', label: 'Zoe', expiresAt: '2026-07-01T12:00:00Z' });
    const a = share({ id: 'a', label: 'Abe', expiresAt: '2026-07-01T12:00:00Z' });
    expect(ids(sortCaregivers([z, a], 'expiry', NOW))).toEqual(['a', 'z']);
  });

  it('orders two no-expiry shares by label only', () => {
    const z = share({ id: 'z', label: 'Zoe' });
    const a = share({ id: 'a', label: 'Abe' });
    expect(ids(sortCaregivers([z, a], 'expiry', NOW))).toEqual(['a', 'z']);
  });

  it('does not mutate the input array', () => {
    const copy = [...expiryPanel];
    sortCaregivers(expiryPanel, 'expiry', NOW);
    expect(expiryPanel).toEqual(copy);
  });
});

describe('summarizeCaregiverSort', () => {
  it('counts viewed vs never-viewed and returns the sorted list', () => {
    const s = summarizeCaregiverSort(panel, 'never-first', NOW);
    expect(s.neverViewedCount).toBe(1);
    expect(s.viewedCount).toBe(3);
    expect(ids(s.shares)[0]).toBe('c_never');
  });
  it('all-never panel reports the full count', () => {
    const s = summarizeCaregiverSort([never, share({ id: 'n2', label: 'Bob' })], 'recent', NOW);
    expect(s.neverViewedCount).toBe(2);
    expect(s.viewedCount).toBe(0);
  });
});

describe('CAREGIVER_SORT_KEYS', () => {
  it('matches the CAREGIVER_SORTS display order', () => {
    expect([...CAREGIVER_SORT_KEYS]).toEqual(CAREGIVER_SORTS.map((o) => o.key));
  });
});

describe('cycleCaregiverSort', () => {
  it('cycles recent -> stale -> never-first -> expiry -> recent', () => {
    expect(cycleCaregiverSort('recent')).toBe('stale');
    expect(cycleCaregiverSort('stale')).toBe('never-first');
    expect(cycleCaregiverSort('never-first')).toBe('expiry');
    expect(cycleCaregiverSort('expiry')).toBe('recent');
  });

  it('cycles backward', () => {
    expect(cycleCaregiverSort('recent', -1)).toBe('expiry');
    expect(cycleCaregiverSort('expiry', -1)).toBe('never-first');
  });

  it('restarts at stale from a junk / missing key on a forward press', () => {
    expect(cycleCaregiverSort('bogus')).toBe('stale');
    expect(cycleCaregiverSort(null)).toBe('stale');
    expect(cycleCaregiverSort(undefined)).toBe('stale');
  });

  it('always returns a valid sort key', () => {
    const keys = CAREGIVER_SORTS.map((o) => o.key);
    for (const k of [...keys, 'junk', null, undefined]) {
      expect(keys).toContain(cycleCaregiverSort(k as string));
    }
  });
});
