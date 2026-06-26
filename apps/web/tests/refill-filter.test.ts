import { describe, it, expect } from 'vitest';
import {
  tabForStatus,
  matchesTab,
  filterByTab,
  countByTab,
  defaultTab,
  REFILL_TABS,
} from '../lib/refill-filter';
import type { Refill } from '../lib/types';

function r(id: string, status: Refill['status']): Refill {
  return {
    id,
    medicationId: `med_${id}`,
    medicationName: id,
    refillBy: new Date().toISOString(),
    status,
  };
}

const refills: Refill[] = [
  r('a', 'needed'),
  r('b', 'needed'),
  r('c', 'requested'),
  r('d', 'ready'),
  r('e', 'picked_up'),
];

describe('tabForStatus', () => {
  it('maps each status onto a tab', () => {
    expect(tabForStatus('needed')).toBe('needed');
    expect(tabForStatus('requested')).toBe('requested');
    expect(tabForStatus('ready')).toBe('ready');
  });
  it('folds picked_up into the Ready tab', () => {
    expect(tabForStatus('picked_up')).toBe('ready');
  });
});

describe('matchesTab', () => {
  it('all matches everything', () => {
    expect(refills.every((x) => matchesTab(x, 'all'))).toBe(true);
  });
  it('a status only matches its own tab', () => {
    expect(matchesTab(r('x', 'needed'), 'needed')).toBe(true);
    expect(matchesTab(r('x', 'needed'), 'ready')).toBe(false);
  });
  it('picked_up matches the Ready tab', () => {
    expect(matchesTab(r('x', 'picked_up'), 'ready')).toBe(true);
  });
});

describe('filterByTab', () => {
  it('returns only the active tab rows', () => {
    expect(filterByTab(refills, 'needed').map((x) => x.id)).toEqual(['a', 'b']);
    expect(filterByTab(refills, 'requested').map((x) => x.id)).toEqual(['c']);
    expect(filterByTab(refills, 'ready').map((x) => x.id)).toEqual(['d', 'e']);
  });
  it('all returns everything', () => {
    expect(filterByTab(refills, 'all')).toHaveLength(5);
  });
  it('does not mutate the input', () => {
    const copy = [...refills];
    filterByTab(refills, 'ready');
    expect(refills).toEqual(copy);
  });
});

describe('countByTab', () => {
  const counts = countByTab(refills);
  it('counts each tab', () => {
    expect(counts.all).toBe(5);
    expect(counts.needed).toBe(2);
    expect(counts.requested).toBe(1);
    expect(counts.ready).toBe(2); // ready + picked_up
  });
  it('returns zeros for an empty list', () => {
    const empty = countByTab([]);
    expect(REFILL_TABS.every((t) => empty[t.tab] === 0)).toBe(true);
  });
});

describe('defaultTab', () => {
  it('prefers Needed when present', () => {
    expect(defaultTab(refills)).toBe('needed');
  });
  it('falls through to Requested then Ready', () => {
    expect(defaultTab([r('c', 'requested'), r('d', 'ready')])).toBe('requested');
    expect(defaultTab([r('d', 'ready')])).toBe('ready');
    expect(defaultTab([r('e', 'picked_up')])).toBe('ready');
  });
  it('falls back to All on an empty list', () => {
    expect(defaultTab([])).toBe('all');
  });
});

describe('REFILL_TABS', () => {
  it('exposes four labelled tabs starting with All', () => {
    expect(REFILL_TABS.map((t) => t.tab)).toEqual(['all', 'needed', 'requested', 'ready']);
    expect(REFILL_TABS.every((t) => t.label.length > 0)).toBe(true);
  });
});
