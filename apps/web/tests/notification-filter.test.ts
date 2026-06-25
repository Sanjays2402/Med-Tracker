import { describe, it, expect } from 'vitest';
import {
  tabForKind,
  matchesTab,
  filterByTab,
  countByTab,
  NOTIFICATION_TABS,
} from '../lib/notification-filter';
import type { NotificationItem } from '../lib/types';

function n(id: string, kind: NotificationItem['kind'], read = false): NotificationItem {
  return { id, title: id, kind, createdAt: new Date().toISOString(), read };
}

const items: NotificationItem[] = [
  n('r1', 'reminder'),
  n('r2', 'reminder', true),
  n('f1', 'refill'),
  n('s1', 'system', true),
  n('c1', 'caregiver'),
];

describe('tabForKind', () => {
  it('maps each kind onto a tab', () => {
    expect(tabForKind('reminder')).toBe('reminder');
    expect(tabForKind('refill')).toBe('refill');
    expect(tabForKind('system')).toBe('system');
  });
  it('folds caregiver into the System tab', () => {
    expect(tabForKind('caregiver')).toBe('system');
  });
});

describe('matchesTab', () => {
  it('all matches everything', () => {
    expect(items.every((i) => matchesTab(i, 'all'))).toBe(true);
  });
  it('a kind only matches its own tab', () => {
    expect(matchesTab(n('x', 'reminder'), 'reminder')).toBe(true);
    expect(matchesTab(n('x', 'reminder'), 'refill')).toBe(false);
  });
  it('caregiver matches the System tab', () => {
    expect(matchesTab(n('x', 'caregiver'), 'system')).toBe(true);
  });
});

describe('filterByTab', () => {
  it('returns only the active tab rows', () => {
    expect(filterByTab(items, 'reminder').map((i) => i.id)).toEqual(['r1', 'r2']);
    expect(filterByTab(items, 'refill').map((i) => i.id)).toEqual(['f1']);
    // System absorbs both system + caregiver
    expect(filterByTab(items, 'system').map((i) => i.id)).toEqual(['s1', 'c1']);
  });
  it('all returns everything in order', () => {
    expect(filterByTab(items, 'all')).toHaveLength(5);
  });
  it('does not mutate the input', () => {
    const copy = [...items];
    filterByTab(items, 'system');
    expect(items).toEqual(copy);
  });
});

describe('countByTab', () => {
  const counts = countByTab(items);
  it('counts totals per tab', () => {
    expect(counts.all.total).toBe(5);
    expect(counts.reminder.total).toBe(2);
    expect(counts.refill.total).toBe(1);
    expect(counts.system.total).toBe(2); // system + caregiver
  });
  it('counts unread per tab', () => {
    expect(counts.all.unread).toBe(3); // r1, f1, c1
    expect(counts.reminder.unread).toBe(1); // r1 (r2 is read)
    expect(counts.refill.unread).toBe(1);
    expect(counts.system.unread).toBe(1); // c1 unread, s1 read
  });
  it('always returns an entry for every tab even when empty', () => {
    const empty = countByTab([]);
    expect(NOTIFICATION_TABS.every((t) => empty[t.tab].total === 0 && empty[t.tab].unread === 0)).toBe(true);
  });
});

describe('NOTIFICATION_TABS', () => {
  it('exposes four labelled tabs starting with All', () => {
    expect(NOTIFICATION_TABS.map((t) => t.tab)).toEqual(['all', 'reminder', 'refill', 'system']);
    expect(NOTIFICATION_TABS.every((t) => t.label.length > 0)).toBe(true);
  });
});
