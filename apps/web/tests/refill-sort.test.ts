import { describe, it, expect } from 'vitest';
import {
  REFILL_SORTS,
  refillDaysUntil,
  sortRefills,
  summarizeRefillSort,
  formatSoonestRunout,
  soonestRunoutTone,
  activeRunoutChip,
  emptyTabSoonestHint,
  soonestRefill,
  soonestRunoutTooltip,
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

describe('activeRunoutChip', () => {
  it('bundles soonest days, label, tone, and the soonest med name', () => {
    expect(activeRunoutChip([later, soon, overdue], NOW)).toEqual({
      days: -2,
      label: 'soonest overdue',
      tone: 'danger',
      medicationName: 'Atorvastatin',
      tooltip: 'Atorvastatin is overdue for a refill',
    });
  });
  it('reads the nearest future when nothing is overdue', () => {
    expect(activeRunoutChip([later, soon], NOW)).toEqual({
      days: 1,
      label: 'next out tomorrow',
      tone: 'danger',
      medicationName: 'Amoxicillin',
      tooltip: 'Amoxicillin runs out tomorrow',
    });
  });
  it('uses a warn tone beyond three days out', () => {
    expect(activeRunoutChip([later], NOW)).toEqual({
      days: 11,
      label: 'next out in 11d',
      tone: 'warn',
      medicationName: 'Lisinopril',
      tooltip: 'Lisinopril runs out in 11d',
    });
  });
  it('is null for an empty list', () => {
    expect(activeRunoutChip([], NOW)).toBeNull();
  });
  it('is null when no refill has a parseable date', () => {
    expect(activeRunoutChip([bad], NOW)).toBeNull();
  });
  it('ignores unparseable dates when a valid one exists', () => {
    expect(activeRunoutChip([bad, soon], NOW)?.days).toBe(1);
  });
});

describe('soonestRefill', () => {
  it('returns the refill that runs out soonest', () => {
    expect(soonestRefill([later, soon, overdue], NOW)?.id).toBe('a');
    expect(soonestRefill([later, soon], NOW)?.id).toBe('b');
  });
  it('skips refills with an unparseable date', () => {
    expect(soonestRefill([bad, later], NOW)?.id).toBe('c');
  });
  it('is null for an empty list or when none parse', () => {
    expect(soonestRefill([], NOW)).toBeNull();
    expect(soonestRefill([bad], NOW)).toBeNull();
  });
  it('does not mutate the input', () => {
    const input = [later, soon, overdue];
    const copy = [...input];
    soonestRefill(input, NOW);
    expect(input).toEqual(copy);
  });
});

describe('soonestRunoutTooltip', () => {
  it('phrases each horizon naming the medication', () => {
    expect(soonestRunoutTooltip('Amoxicillin', -1)).toBe('Amoxicillin is overdue for a refill');
    expect(soonestRunoutTooltip('Amoxicillin', 0)).toBe('Amoxicillin runs out today');
    expect(soonestRunoutTooltip('Amoxicillin', 1)).toBe('Amoxicillin runs out tomorrow');
    expect(soonestRunoutTooltip('Amoxicillin', 5)).toBe('Amoxicillin runs out in 5d');
  });
  it('falls back to a generic subject for a blank name', () => {
    expect(soonestRunoutTooltip('   ', 3)).toBe('A medication runs out in 3d');
  });
  it('is null for an unknown horizon', () => {
    expect(soonestRunoutTooltip('Amoxicillin', null)).toBeNull();
    expect(soonestRunoutTooltip('Amoxicillin', Number.NaN)).toBeNull();
  });
});

describe('emptyTabSoonestHint', () => {
  const pickedUp = refill({ id: 'p', medicationName: 'Sertraline', refillBy: daysFromNow(0), status: 'picked_up' });

  it('names the soonest run-out across all tabs and points at All', () => {
    const hint = emptyTabSoonestHint([overdue, soon, later], NOW);
    expect(hint).not.toBeNull();
    // Overdue is the soonest among the active set.
    expect(hint!.chip.medicationName).toBe('Atorvastatin');
    expect(hint!.message).toBe('Atorvastatin is overdue for a refill — see the All tab.');
    // An overdue soonest is urgent -> danger tone.
    expect(hint!.tone).toBe('danger');
    expect(hint!.urgent).toBe(true);
  });

  it('phrases a future soonest run-out', () => {
    const hint = emptyTabSoonestHint([soon, later], NOW);
    expect(hint!.chip.medicationName).toBe('Amoxicillin');
    expect(hint!.message).toBe('Amoxicillin runs out tomorrow — see the All tab.');
  });

  it('ignores picked-up refills (a completed pickup is not a pending run-out)', () => {
    // Picked-up is the nearest date but should be excluded; soon wins.
    const hint = emptyTabSoonestHint([pickedUp, soon], NOW);
    expect(hint!.chip.medicationName).toBe('Amoxicillin');
  });

  it('is null when only picked-up or unparseable refills remain', () => {
    expect(emptyTabSoonestHint([pickedUp], NOW)).toBeNull();
    expect(emptyTabSoonestHint([bad], NOW)).toBeNull();
    expect(emptyTabSoonestHint([], NOW)).toBeNull();
  });

  it('reuses the same soonest as the always-on chip', () => {
    const all = [later, overdue, soon];
    const hint = emptyTabSoonestHint(all, NOW);
    const chip = activeRunoutChip(all, NOW);
    expect(hint!.chip.medicationName).toBe(chip!.medicationName);
    expect(hint!.chip.days).toBe(chip!.days);
  });

  it('tones a comfortably-future soonest as warn (not urgent)', () => {
    // `later` runs out in 11 days -> warn tone, not urgent.
    const hint = emptyTabSoonestHint([later], NOW);
    expect(hint!.tone).toBe('warn');
    expect(hint!.urgent).toBe(false);
  });

  it('mirrors the chip tone exactly', () => {
    const hint = emptyTabSoonestHint([soon, later], NOW);
    expect(hint!.tone).toBe(hint!.chip.tone);
  });
});
