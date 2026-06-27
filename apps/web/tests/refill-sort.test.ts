import { describe, it, expect } from 'vitest';
import {
  REFILL_SORTS,
  refillDaysUntil,
  sortRefills,
  summarizeRefillSort,
  formatSoonestRunout,
  soonestRunoutTone,
  type RefillSortKey,
} from '../lib/refill-sort';
import type { Refill } from '../lib/types';

// Fixed clock: 2026-06-26T12:00:00Z.
const NOW = Date.parse('2026-06-26T12:00:00Z');

function refill(over: Partial<Refill> & { id: string; medicationName: string; refillBy: string }): Refill {
  return {
    medicationId: `med_${over.id}`,
    status: 'needed',
    ...over,
  };
}

function daysFromNow(n: number): string {
  return new Date(NOW + n * 86_400_000).toISOString();
}

const overdue = refill({ id: 'a', medicationName: 'Atorvastatin', refillBy: daysFromNow(-2) });
const soon = refill({ id: 'b', medicationName: 'Amoxicillin', refillBy: daysFromNow(1) });
const later = refill({ id: 'c', medicationName: 'Lisinopril', refillBy: daysFromNow(11) });
const bad = refill({ id: 'd', medicationName: 'Metformin', refillBy: 'not-a-date' });

function ids(list: Refill[]): string[] {
  return list.map((r) => r.id);
}

describe('REFILL_SORTS', () => {
  it('offers default and runout', () => {
    expect(REFILL_SORTS.map((o) => o.key)).toEqual<RefillSortKey[]>(['default', 'runout']);
  });
});

describe('refillDaysUntil', () => {
  it('is negative when overdue', () => {
    expect(refillDaysUntil(overdue, NOW)).toBe(-2);
  });
  it('ceils a same-day-later time to 0 and tomorrow to 1', () => {
    expect(refillDaysUntil({ refillBy: new Date(NOW + 6 * 3600_000).toISOString() }, NOW)).toBe(1);
    expect(refillDaysUntil({ refillBy: new Date(NOW).toISOString() }, NOW)).toBe(0);
  });
  it('returns null for an unparseable date', () => {
    expect(refillDaysUntil(bad, NOW)).toBeNull();
  });
});

describe('sortRefills', () => {
  it('default returns a copy in input order', () => {
    const input = [later, overdue, soon];
    const out = sortRefills(input, 'default', NOW);
    expect(ids(out)).toEqual(['c', 'a', 'b']);
    expect(out).not.toBe(input);
  });
  it('runout orders overdue first, then nearest future', () => {
    expect(ids(sortRefills([later, soon, overdue], 'runout', NOW))).toEqual(['a', 'b', 'c']);
  });
  it('runout pushes unparseable dates to the end', () => {
    expect(ids(sortRefills([bad, later, overdue], 'runout', NOW))).toEqual(['a', 'c', 'd']);
  });
  it('breaks date ties by medication name A-Z', () => {
    const zed = refill({ id: 'z', medicationName: 'Zeta', refillBy: daysFromNow(3) });
    const alpha = refill({ id: 'al', medicationName: 'Alpha', refillBy: daysFromNow(3) });
    expect(ids(sortRefills([zed, alpha], 'runout', NOW))).toEqual(['al', 'z']);
  });
  it('does not mutate the input', () => {
    const input = [later, overdue, soon];
    const snapshot = ids(input);
    sortRefills(input, 'runout', NOW);
    expect(ids(input)).toEqual(snapshot);
  });
});

describe('summarizeRefillSort', () => {
  it('reports the sorting flag and soonest days under runout', () => {
    const s = summarizeRefillSort([later, soon, overdue], 'runout', NOW);
    expect(s.sorting).toBe(true);
    expect(ids(s.refills)).toEqual(['a', 'b', 'c']);
    expect(s.soonestDays).toBe(-2);
  });
  it('reports no soonest under the default sort', () => {
    const s = summarizeRefillSort([later, soon], 'default', NOW);
    expect(s.sorting).toBe(false);
    expect(s.soonestDays).toBeNull();
  });
  it('handles an empty list', () => {
    const s = summarizeRefillSort([], 'runout', NOW);
    expect(s.refills).toEqual([]);
    expect(s.soonestDays).toBeNull();
  });
});

describe('formatSoonestRunout', () => {
  it('phrases an overdue soonest', () => {
    expect(formatSoonestRunout(-2)).toBe('soonest overdue');
  });
  it('phrases today / tomorrow', () => {
    expect(formatSoonestRunout(0)).toBe('next out today');
    expect(formatSoonestRunout(1)).toBe('next out tomorrow');
  });
  it('phrases N days', () => {
    expect(formatSoonestRunout(11)).toBe('next out in 11d');
  });
  it('truncates a fractional value', () => {
    expect(formatSoonestRunout(4.9)).toBe('next out in 4d');
  });
  it('returns null when there is nothing to show', () => {
    expect(formatSoonestRunout(null)).toBeNull();
    expect(formatSoonestRunout(undefined)).toBeNull();
    expect(formatSoonestRunout(Number.NaN)).toBeNull();
  });
  it('reads straight off a runout summary', () => {
    const s = summarizeRefillSort([later, soon, overdue], 'runout', NOW);
    expect(formatSoonestRunout(s.soonestDays)).toBe('soonest overdue');
  });
});

describe('soonestRunoutTone', () => {
  it('is danger when overdue or within three days', () => {
    expect(soonestRunoutTone(-2)).toBe('danger');
    expect(soonestRunoutTone(0)).toBe('danger');
    expect(soonestRunoutTone(3)).toBe('danger');
  });
  it('is warn beyond three days', () => {
    expect(soonestRunoutTone(4)).toBe('warn');
    expect(soonestRunoutTone(30)).toBe('warn');
  });
  it('is neutral when unknown', () => {
    expect(soonestRunoutTone(null)).toBe('neutral');
    expect(soonestRunoutTone(undefined)).toBe('neutral');
    expect(soonestRunoutTone(Number.NaN)).toBe('neutral');
  });
});
