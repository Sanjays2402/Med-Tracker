import { describe, it, expect } from 'vitest';
import {
  tabForKind,
  matchesTab,
  filterByTab,
  countByTab,
  isUnread,
  filterUnreadOnly,
  applyNotificationFilters,
  summarizeUnread,
  crossTabUnreadHint,
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

describe('isUnread', () => {
  it('treats a falsy read flag as unread', () => {
    expect(isUnread(n('x', 'reminder', false))).toBe(true);
    expect(isUnread(n('x', 'reminder', true))).toBe(false);
  });
});

describe('filterUnreadOnly', () => {
  it('keeps only the unread rows in order', () => {
    expect(filterUnreadOnly(items).map((i) => i.id)).toEqual(['r1', 'f1', 'c1']);
  });
  it('does not mutate the input', () => {
    const copy = [...items];
    filterUnreadOnly(items);
    expect(items).toEqual(copy);
  });
});

describe('applyNotificationFilters', () => {
  it('applies only the tab when unread-only is off', () => {
    expect(applyNotificationFilters(items, 'reminder', false).map((i) => i.id)).toEqual(['r1', 'r2']);
  });
  it('composes the tab AND unread-only', () => {
    // Reminder tab has r1 (unread) + r2 (read); unread-only drops r2.
    expect(applyNotificationFilters(items, 'reminder', true).map((i) => i.id)).toEqual(['r1']);
  });
  it('applies unread-only across the All tab', () => {
    expect(applyNotificationFilters(items, 'all', true).map((i) => i.id)).toEqual(['r1', 'f1', 'c1']);
  });
  it('returns empty when the tab has no unread rows', () => {
    // System tab: s1 (read) + c1 (unread) -> unread-only keeps c1.
    expect(applyNotificationFilters(items, 'system', true).map((i) => i.id)).toEqual(['c1']);
    // A tab whose rows are all read yields nothing under unread-only.
    const allRead = [n('a', 'reminder', true), n('b', 'reminder', true)];
    expect(applyNotificationFilters(allRead, 'reminder', true)).toEqual([]);
  });
});

describe('summarizeUnread', () => {
  it('counts in-tab vs unread-in-tab and flags hidden reads', () => {
    // Reminder tab: 2 total, 1 unread -> hasRead true.
    expect(summarizeUnread(items, 'reminder')).toEqual({ inTab: 2, unreadInTab: 1, hasRead: true });
  });
  it('hasRead is false when the tab is already all unread', () => {
    // Refill tab: only f1 (unread).
    expect(summarizeUnread(items, 'refill')).toEqual({ inTab: 1, unreadInTab: 1, hasRead: false });
  });
  it('summarises the All tab', () => {
    // 5 total, 3 unread, 2 read -> hasRead true.
    expect(summarizeUnread(items, 'all')).toEqual({ inTab: 5, unreadInTab: 3, hasRead: true });
  });
  it('is all-zero for an empty inbox', () => {
    expect(summarizeUnread([], 'all')).toEqual({ inTab: 0, unreadInTab: 0, hasRead: false });
  });
});

describe('crossTabUnreadHint', () => {
  it('is null on the All tab (it shows everything)', () => {
    expect(crossTabUnreadHint(items, 'all')).toBeNull();
  });

  it('is null when the active tab still has rows', () => {
    // Reminder tab has r1 + r2, so it is not empty.
    expect(crossTabUnreadHint(items, 'reminder')).toBeNull();
  });

  it('points at the busiest other tab when the active tab is empty', () => {
    // System tab: only s1 (read) + c1 (unread). Move to an empty tab by using a
    // list with NO refills, then ask from the (empty) refill tab.
    const noRefills = [n('r1', 'reminder'), n('r2', 'reminder'), n('c1', 'caregiver')];
    const hint = crossTabUnreadHint(noRefills, 'refill');
    // Reminder has 2 unread, System (caregiver) has 1 -> reminder wins.
    expect(hint).toEqual({ tab: 'reminder', label: 'Reminders', unread: 2, message: '2 unread in Reminders' });
  });

  it('names the System tab when caregiver/system unread dominate', () => {
    const list = [n('f-read', 'refill', true), n('c1', 'caregiver'), n('s1', 'system')];
    // Ask from the empty reminder tab: System has 2 unread (c1 + s1), refill has 0.
    const hint = crossTabUnreadHint(list, 'reminder');
    expect(hint).toEqual({ tab: 'system', label: 'System', unread: 2, message: '2 unread in System' });
  });

  it('is null when no other tab has unread', () => {
    // Active empty tab = refill; the rest are all read -> nothing to point at.
    const allRead = [n('r1', 'reminder', true), n('s1', 'system', true)];
    expect(crossTabUnreadHint(allRead, 'refill')).toBeNull();
  });

  it('does not count the active tab against itself', () => {
    // Refill has unread, but we are ON the refill tab and it is empty here
    // because we removed refills; only reminder unread should surface.
    const list = [n('r1', 'reminder')];
    const hint = crossTabUnreadHint(list, 'refill');
    expect(hint?.tab).toBe('reminder');
  });
});
