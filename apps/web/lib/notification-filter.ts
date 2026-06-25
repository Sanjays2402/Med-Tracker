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
