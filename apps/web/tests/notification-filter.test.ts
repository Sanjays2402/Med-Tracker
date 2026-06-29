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
  tabReadTargets,
  markTabReadLabel,
  markTabReadToastTitle,
  unreadInGroup,
  totalUnread,
  notificationsTitle,
  unreadCountPill,
  unreadBadgeTone,
  dayGroupUnreadLabel,
  caughtUpCopy,
  shouldCaughtUpBurst,
  CAUGHT_UP_TITLE,
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

describe('tabReadTargets', () => {
  it('collects the unread ids under the active tab only', () => {
    // reminder tab: r1 unread, r2 read -> just r1.
    expect(tabReadTargets(items, 'reminder')).toEqual({ ids: ['r1'], count: 1 });
  });

  it('folds caregiver unread into the System tab targets', () => {
    // system tab absorbs caregiver: s1 read, c1 unread -> just c1.
    expect(tabReadTargets(items, 'system')).toEqual({ ids: ['c1'], count: 1 });
  });

  it('on the All tab collects every unread row in input order', () => {
    expect(tabReadTargets(items, 'all').ids).toEqual(['r1', 'f1', 'c1']);
  });

  it('respects the unread-only constraint (still only unread)', () => {
    // unread-only doesn't change WHICH unread there are, just confirms the
    // filtered view is unread rows; reminder tab -> r1.
    expect(tabReadTargets(items, 'reminder', true)).toEqual({ ids: ['r1'], count: 1 });
  });

  it('is empty when the active tab has no unread', () => {
    const allRead = [n('r1', 'reminder', true), n('r2', 'reminder', true)];
    expect(tabReadTargets(allRead, 'reminder')).toEqual({ ids: [], count: 0 });
  });
});

describe('markTabReadLabel', () => {
  it('names the scoped tab and count for a sub-tab', () => {
    expect(markTabReadLabel(items, 'reminder')).toBe('Mark 1 Reminders read');
  });

  it('omits the tab name on the All tab (it is the whole inbox)', () => {
    expect(markTabReadLabel(items, 'all')).toBe('Mark 3 read');
  });

  it('is null when nothing unread remains in the view', () => {
    const allRead = [n('s1', 'system', true)];
    expect(markTabReadLabel(allRead, 'system')).toBeNull();
  });
});

describe('markTabReadToastTitle', () => {
  it('names the count and tab for a sub-tab', () => {
    expect(markTabReadToastTitle(3, 'refill')).toBe('3 Refills marked read');
    expect(markTabReadToastTitle(1, 'reminder')).toBe('1 Reminders marked read');
    expect(markTabReadToastTitle(2, 'system')).toBe('2 System marked read');
  });

  it('omits the tab name on the All tab', () => {
    expect(markTabReadToastTitle(4, 'all')).toBe('4 marked read');
  });

  it('is null for a zero or negative count (fire nothing)', () => {
    expect(markTabReadToastTitle(0, 'refill')).toBeNull();
    expect(markTabReadToastTitle(-1, 'all')).toBeNull();
  });
});

describe('unreadInGroup', () => {
  it('counts unread items within a group', () => {
    expect(unreadInGroup([n('a', 'reminder'), n('b', 'reminder', true), n('c', 'system')])).toBe(2);
  });
  it('is zero for an empty or fully-read group', () => {
    expect(unreadInGroup([])).toBe(0);
    expect(unreadInGroup([n('a', 'system', true)])).toBe(0);
  });
});

describe('dayGroupUnreadLabel', () => {
  it('names the unread sub-count when some are unread', () => {
    expect(dayGroupUnreadLabel([n('a', 'reminder'), n('b', 'reminder', true)])).toBe('1 unread');
    expect(dayGroupUnreadLabel([n('a', 'reminder'), n('b', 'system')])).toBe('2 unread');
  });
  it('is null when nothing is unread (no "0 unread" noise)', () => {
    expect(dayGroupUnreadLabel([n('a', 'system', true)])).toBeNull();
    expect(dayGroupUnreadLabel([])).toBeNull();
  });
});

describe('caughtUpCopy', () => {
  it('returns null when unread-only is off', () => {
    expect(caughtUpCopy(false, { inTab: 5, unreadInTab: 0, hasRead: true })).toBeNull();
  });
  it('returns null when the tab is genuinely empty (no-rows empty)', () => {
    expect(caughtUpCopy(true, { inTab: 0, unreadInTab: 0, hasRead: false })).toBeNull();
  });
  it('celebrates "all caught up" when the tab cleared its unread', () => {
    const c = caughtUpCopy(true, { inTab: 4, unreadInTab: 0, hasRead: true });
    expect(c?.title).toBe("You're all caught up");
    expect(c?.description).toContain('Turn off Unread only');
  });
  it('reads "no unread here" when some unread remain (filter hid the read rows)', () => {
    const c = caughtUpCopy(true, { inTab: 4, unreadInTab: 2, hasRead: true });
    expect(c?.title).toBe('No unread here');
  });
});


describe('shouldCaughtUpBurst', () => {
  const celebrate = caughtUpCopy(true, { inTab: 3, unreadInTab: 0, hasRead: true });
  const calm = caughtUpCopy(true, { inTab: 3, unreadInTab: 2, hasRead: true });

  it('exports a title the gate keys off', () => {
    expect(celebrate?.title).toBe(CAUGHT_UP_TITLE);
  });
  it('fires only on the celebratory copy with motion allowed', () => {
    expect(shouldCaughtUpBurst(celebrate, false)).toBe(true);
  });
  it('stays silent under reduced motion', () => {
    expect(shouldCaughtUpBurst(celebrate, true)).toBe(false);
  });
  it('stays silent on the calm no-unread copy', () => {
    expect(shouldCaughtUpBurst(calm, false)).toBe(false);
  });
  it('stays silent when there is no copy', () => {
    expect(shouldCaughtUpBurst(null, false)).toBe(false);
  });
});

describe('totalUnread', () => {
  it('counts unread across the inbox', () => {
    expect(totalUnread([n('a', 'reminder'), n('b', 'refill', true), n('c', 'system')])).toBe(2);
    expect(totalUnread([])).toBe(0);
  });
});

describe('notificationsTitle', () => {
  it('prefixes the unread count', () => {
    expect(notificationsTitle(3)).toBe('(3) Notifications');
    expect(notificationsTitle(0)).toBe('Notifications');
  });
  it('caps the badge at 99+', () => {
    expect(notificationsTitle(150)).toBe('(99+) Notifications');
  });
});

describe('unreadCountPill', () => {
  it('reads "N unread" or null at zero', () => {
    expect(unreadCountPill(2)).toBe('2 unread');
    expect(unreadCountPill(0)).toBeNull();
    expect(unreadCountPill(120)).toBe('99+ unread');
  });
});

describe('unreadBadgeTone', () => {
  it('is null when nothing is unread', () => {
    expect(unreadBadgeTone([n('a', 'reminder', true), n('b', 'refill', true)])).toBeNull();
    expect(unreadBadgeTone([])).toBeNull();
  });
  it('is reminder (amber) when only plain reminders are unread', () => {
    expect(unreadBadgeTone([n('a', 'reminder'), n('b', 'reminder', true)])).toBe('reminder');
  });
  it('escalates to alert (coral) for an unread refill', () => {
    expect(unreadBadgeTone([n('a', 'reminder'), n('f', 'refill')])).toBe('alert');
  });
  it('escalates to alert for an unread system or caregiver notification', () => {
    expect(unreadBadgeTone([n('s', 'system')])).toBe('alert');
    expect(unreadBadgeTone([n('c', 'caregiver')])).toBe('alert');
  });
  it('ignores READ alerts when deciding the tone', () => {
    // The refill + system are read, only a reminder is unread -> amber, not coral.
    expect(unreadBadgeTone([n('f', 'refill', true), n('s', 'system', true), n('r', 'reminder')]))
      .toBe('reminder');
  });
  it('treats a missing read flag as unread (matches isUnread)', () => {
    const noFlag: NotificationItem = { id: 'x', title: 'x', kind: 'refill', createdAt: new Date().toISOString() };
    expect(unreadBadgeTone([noFlag])).toBe('alert');
  });
});
