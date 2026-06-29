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
import type { FaviconBadgeTone } from './favicon-badge';

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

export interface CrossTabUnreadHint {
  /** The tab that holds the most unread rows (never 'all'). */
  tab: Exclude<NotificationTab, 'all'>;
  /** That tab's human label, e.g. "Refills". */
  label: string;
  /** Unread count in that tab. */
  unread: number;
  /** Render-ready sentence, e.g. "3 unread in Refills". */
  message: string;
}

/** Look up a tab's label from NOTIFICATION_TABS (falls back to the tab key). */
function labelForTab(tab: NotificationTab): string {
  return NOTIFICATION_TABS.find((t) => t.tab === tab)?.label ?? tab;
}

/**
 * When the active (non-All) tab is empty but unread notifications live in OTHER
 * tabs, point the user at where the unread actually are so an empty tab doesn't
 * read as "all caught up" when something still needs attention elsewhere.
 * Parallels the refills empty-tab hint.
 *
 * Returns null when: the active tab is 'all' (it shows everything, so it's never
 * misleadingly empty); the active tab still has rows (not empty); or no OTHER
 * tab holds any unread (nothing worth pointing at). Otherwise it names the tab
 * with the MOST unread (ties broken by NOTIFICATION_TABS order) so the nudge
 * sends the user to the busiest inbox. The whole (unsnoozed) list is passed in,
 * so counts reflect what the user would see.
 */
export function crossTabUnreadHint(
  items: readonly NotificationItem[],
  activeTab: NotificationTab,
): CrossTabUnreadHint | null {
  if (activeTab === 'all') return null;
  // Only hint when the tab the user is on is actually empty.
  if (filterByTab(items, activeTab).length > 0) return null;

  const counts = countByTab(items);
  let best: Exclude<NotificationTab, 'all'> | null = null;
  let bestUnread = 0;
  for (const def of NOTIFICATION_TABS) {
    if (def.tab === 'all' || def.tab === activeTab) continue;
    const unread = counts[def.tab].unread;
    if (unread > bestUnread) {
      bestUnread = unread;
      best = def.tab as Exclude<NotificationTab, 'all'>;
    }
  }
  if (!best || bestUnread === 0) return null;

  const label = labelForTab(best);
  return {
    tab: best,
    label,
    unread: bestUnread,
    message: `${bestUnread} unread in ${label}`,
  };
}

export interface TabReadTargets {
  /** Ids of the unread notifications under the active filtered view, input order. */
  ids: string[];
  /** Convenience count (= ids.length). */
  count: number;
}

/**
 * Collect the ids of the unread notifications under the active tab (and the
 * unread-only constraint, if on) so a "Mark these read" action can clear just
 * the view the user is looking at — distinct from the global "Mark all read".
 *
 * Reuses applyNotificationFilters so the targeted ids are EXACTLY the rows the
 * page renders for that tab: switching to "Refills" then marking-these-read
 * touches only refill rows, never the reminders sitting under another tab. Order
 * follows the input so it tracks the rendered order. When the active tab is
 * 'all' this collects every unread row (equivalent to mark-all, by design — the
 * All tab IS the whole inbox). Pure.
 */
export function tabReadTargets(
  items: readonly NotificationItem[],
  tab: NotificationTab,
  unreadOnly = false,
): TabReadTargets {
  const ids = applyNotificationFilters(items, tab, unreadOnly)
    .filter(isUnread)
    .map((i) => i.id);
  return { ids, count: ids.length };
}

/**
 * Render-ready label for the "Mark these read" control, or null when there is
 * nothing unread in the active view (so the page hides the control rather than
 * showing a no-op). Names the tab so the action reads as scoped: "Mark 3
 * Refills read"; the All tab reads "Mark 3 read" since it isn't a sub-filter.
 */
export function markTabReadLabel(
  items: readonly NotificationItem[],
  tab: NotificationTab,
  unreadOnly = false,
): string | null {
  const { count } = tabReadTargets(items, tab, unreadOnly);
  if (count === 0) return null;
  if (tab === 'all') return `Mark ${count} read`;
  return `Mark ${count} ${labelForTab(tab)} read`;
}

/**
 * Confirming-toast title for AFTER the scoped "Mark these read" runs, naming how
 * many rows were cleared and (for a sub-tab) which tab: "3 Refills marked read".
 * The All tab reads "3 marked read" since it isn't a sub-filter. The tab labels
 * are already plural nouns (Reminders / Refills / System), so they're used
 * verbatim — matching the wording of the "Mark N Refills read" button this
 * confirms. Returns null when the count is zero so the caller fires nothing.
 *
 * `count` is the number actually marked (the caller passes tabReadTargets' count
 * captured BEFORE the optimistic update, so the toast reports what it cleared).
 * Pure; no React — the page hands the title to its existing Toast layer.
 */
export function markTabReadToastTitle(
  count: number,
  tab: NotificationTab,
): string | null {
  if (count <= 0) return null;
  if (tab === 'all') return `${count} marked read`;
  return `${count} ${labelForTab(tab)} marked read`;
}

/** Unread tally within a single day-group's items. */
export function unreadInGroup(items: readonly NotificationItem[]): number {
  return items.reduce((n, i) => n + (isUnread(i) ? 1 : 0), 0);
}

/** Total unread across the whole (visible) inbox. */
export function totalUnread(items: readonly NotificationItem[]): number {
  return unreadInGroup(items);
}

/**
 * Document-title string reflecting the unread inbox count, so the count reads
 * from the browser tab before the page is open: "(3) Notifications" / just
 * "Notifications" when nothing is unread. Caps the badge at 99+ so a flooded
 * inbox doesn't blow out the tab label. Pure; the page assigns it to
 * document.title in an effect.
 */
export function notificationsTitle(unread: number): string {
  if (unread <= 0) return 'Notifications';
  return `(${unread > 99 ? '99+' : unread}) Notifications`;
}

/** Compact header count pill, e.g. "3 unread" / "99+ unread". Null when zero. */
export function unreadCountPill(unread: number): string | null {
  if (unread <= 0) return null;
  return `${unread > 99 ? '99+' : unread} unread`;
}

/**
 * The favicon badge tone for the current unread inbox, derived from the WORST
 * unread kind so the tab dot's colour carries urgency, not just presence:
 *
 *   - any unread refill / system / caregiver -> 'alert' (coral) — these are the
 *     louder kinds (a refill running low, a system or caregiver alert).
 *   - only plain reminders unread            -> 'reminder' (amber) — a routine
 *     dose nudge, quieter than an alert.
 *   - nothing unread                         -> null (no badge; the page shows
 *     the plain favicon).
 *
 * 'reminder' is the single quiet kind; every other kind escalates to 'alert',
 * matching how the notification tabs already fold caregiver into System. Pure;
 * the page passes the tone straight into faviconHref's `tone` option so the
 * drawn dot colour and this classification can never disagree.
 */
export function unreadBadgeTone(items: readonly NotificationItem[]): FaviconBadgeTone | null {
  let sawReminder = false;
  for (const item of items) {
    if (!isUnread(item)) continue;
    if (item.kind === 'reminder') sawReminder = true;
    else return 'alert'; // any non-reminder unread escalates immediately
  }
  return sawReminder ? 'reminder' : null;
}

/**
 * Compact sub-count for a /notifications day-group header. The group already
 * shows its total ("Today · 5"); this appends the unread share so a busy day
 * reads "Today · 5 · 2 unread" and a fully-read day stays just the total. Pure;
 * composes isUnread so the unread definition can't drift from the row dot.
 *
 * Returns null when nothing in the group is unread so the caller renders only
 * the total (no "0 unread" noise). Pluralises is unnecessary — the word is fixed
 * "unread" — so it reads "1 unread" / "2 unread" uniformly.
 */
export function dayGroupUnreadLabel(items: readonly NotificationItem[]): string | null {
  const unread = unreadInGroup(items);
  return unread > 0 ? `${unread} unread` : null;
}

export interface CaughtUpCopy {
  title: string;
  description: string;
}

/**
 * The empty-state copy for the unread-only view, splitting the two reasons the
 * filtered list can be empty so the user gets the right message:
 *
 *   - The tab HAD unread that the user just cleared (hasRead via the read items
 *     remaining) -> a positive "all caught up" with a hint to turn off the
 *     filter. This is the celebratory case distinct from a barren inbox.
 *   - The tab had nothing unread to begin with (inTab present but never any
 *     unread) -> a calm "nothing unread here", no false victory lap.
 *   - The tab is genuinely empty (inTab 0) -> null: that's the no-rows empty,
 *     not an unread-only state, so the caller renders its standard empty.
 *
 * Returns null when unread-only is OFF (the caller handles non-unread empties)
 * or when there are no rows in the tab at all. `summary` is summarizeUnread's
 * result for the active tab. Pure; no React — caller drops it into <Empty>.
 */
export function caughtUpCopy(
  unreadOnly: boolean,
  summary: UnreadToggleSummary,
): CaughtUpCopy | null {
  if (!unreadOnly || summary.inTab === 0) return null;
  if (summary.unreadInTab === 0) {
    return {
      title: CAUGHT_UP_TITLE,
      description: 'No unread notifications in this view. Turn off Unread only to see the rest.',
    };
  }
  return {
    title: 'No unread here',
    description: "You've read everything that's left in this view.",
  };
}

/** The celebratory title; the burst gate keys off it so the two stay in sync. */
export const CAUGHT_UP_TITLE = "You're all caught up";

/**
 * Whether the "all caught up" sage burst should fire: only on the celebratory
 * copy (the user just cleared real unread — not the calm "No unread here"), and
 * never under reduced-motion. A burst is one-shot; the caller fires it once per
 * transition into this state, so this is the pure gate, not a trigger. Null/calm
 * copy -> false. Pure; no React.
 */
export function shouldCaughtUpBurst(
  copy: CaughtUpCopy | null,
  reducedMotion: boolean,
): boolean {
  return !reducedMotion && copy !== null && copy.title === CAUGHT_UP_TITLE;
}
