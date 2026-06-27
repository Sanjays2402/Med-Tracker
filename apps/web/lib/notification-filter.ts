/**
 * notification-filter — pure tab model for the /notifications filter row.
 *
 * The notifications inbox gets a tab row (All / Reminders / Refills / System)
 * with per-tab unread-aware counts. This module maps notification kinds onto
 * tabs, counts them, and filters a list to the active tab — no React, so the
 * page stays a thin render and the bucketing stays unit-tested.
 *
 * The four notification kinds are 'reminder' | 'refill' | 'system' | 'caregiver'.
 * The "System" tab is a catch-all that also absorbs 'caregiver' so every
 * notification lands under exactly one visible tab.
 */

import type { NotificationItem } from './types';

export type NotificationTab = 'all' | 'reminder' | 'refill' | 'system';

export interface NotificationTabDef {
  tab: NotificationTab;
  label: string;
}

export const NOTIFICATION_TABS: NotificationTabDef[] = [
  { tab: 'all', label: 'All' },
  { tab: 'reminder', label: 'Reminders' },
  { tab: 'refill', label: 'Refills' },
  { tab: 'system', label: 'System' },
];

/** Which tab a notification kind belongs to. 'caregiver' folds into System. */
export function tabForKind(kind: NotificationItem['kind']): Exclude<NotificationTab, 'all'> {
  switch (kind) {
    case 'reminder': return 'reminder';
    case 'refill': return 'refill';
    case 'system': return 'system';
    case 'caregiver': return 'system';
  }
}

/** True when the notification belongs in the given tab ('all' matches everything). */
export function matchesTab(item: NotificationItem, tab: NotificationTab): boolean {
  if (tab === 'all') return true;
  return tabForKind(item.kind) === tab;
}

export function filterByTab(
  items: readonly NotificationItem[],
  tab: NotificationTab,
): NotificationItem[] {
  return items.filter((i) => matchesTab(i, tab));
}

/** True when the notification is unread (treats a missing `read` as unread). */
export function isUnread(item: NotificationItem): boolean {
  return !item.read;
}

/** Keep only the unread notifications. */
export function filterUnreadOnly(items: readonly NotificationItem[]): NotificationItem[] {
  return items.filter(isUnread);
}

/**
 * Apply the active tab AND an optional unread-only constraint in one pass,
 * preserving input order. The two filters compose: the tab narrows by kind, then
 * unread-only (when on) drops the read rows. The page calls this so the visible
 * list, the empty-state copy, and any counts all read from the same predicate.
 */
export function applyNotificationFilters(
  items: readonly NotificationItem[],
  tab: NotificationTab,
  unreadOnly: boolean,
): NotificationItem[] {
  return items.filter((i) => matchesTab(i, tab) && (!unreadOnly || isUnread(i)));
}

export interface UnreadToggleSummary {
  /** Items visible under the active tab, ignoring the unread-only constraint. */
  inTab: number;
  /** Unread items under the active tab. */
  unreadInTab: number;
  /** True when the tab has read items that the unread-only toggle would hide. */
  hasRead: boolean;
}

/**
 * Counts the unread-only toggle needs to decide whether to render and what to
 * say. `inTab` is everything under the active tab; `unreadInTab` is the unread
 * subset; `hasRead` is true when toggling unread-only would actually hide
 * something (so a tab that is already all-unread can hide or disable the
 * control). Computed over the active tab, not the whole inbox, so it tracks the
 * tab the user is on.
 */
export function summarizeUnread(
  items: readonly NotificationItem[],
  tab: NotificationTab,
): UnreadToggleSummary {
  const inTabItems = filterByTab(items, tab);
  const unreadInTab = inTabItems.reduce((n, i) => n + (isUnread(i) ? 1 : 0), 0);
  return {
    inTab: inTabItems.length,
    unreadInTab,
    hasRead: inTabItems.length > unreadInTab,
  };
}

export interface TabCount {
  /** Total notifications under the tab. */
  total: number;
  /** Unread notifications under the tab. */
  unread: number;
}

/**
 * Per-tab counts for the whole list. Every tab present in NOTIFICATION_TABS gets
 * an entry (including empty ones) so the renderer can always show a count badge.
 */
export function countByTab(items: readonly NotificationItem[]): Record<NotificationTab, TabCount> {
  const out: Record<NotificationTab, TabCount> = {
    all: { total: 0, unread: 0 },
    reminder: { total: 0, unread: 0 },
    refill: { total: 0, unread: 0 },
    system: { total: 0, unread: 0 },
  };
  for (const item of items) {
    const unread = !item.read;
    out.all.total++;
    if (unread) out.all.unread++;
    const tab = tabForKind(item.kind);
    out[tab].total++;
    if (unread) out[tab].unread++;
  }
  return out;
}
