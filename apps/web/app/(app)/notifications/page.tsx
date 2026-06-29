'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, BellRinging, CheckCircle, Pill as PillIcon, Users, Clock, Moon } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Btn, formatDate } from '../../../components/uikit';
import { listNotifications, markNotificationRead, markAllNotificationsRead, snoozeNotification } from '../../../lib/data';
import type { NotificationItem } from '../../../lib/types';
import { useToast } from '../../../components/Toast';
import { SNOOZE_OPTIONS, snoozeUntil, snoozeLabel, type SnoozeChoice } from '../../../lib/snooze';
import { NOTIFICATION_TABS, countByTab, applyNotificationFilters, summarizeUnread, crossTabUnreadHint, tabReadTargets, markTabReadLabel, markTabReadToastTitle, dayGroupUnreadLabel, caughtUpCopy, type NotificationTab } from '../../../lib/notification-filter';
import {
  NOTIFICATION_UNREAD_STORAGE_KEY,
  parseUnreadOnly,
  serializeUnreadOnly,
} from '../../../lib/notification-unread-pref';
import { groupByDay } from '../../../lib/day-group';

export default function NotificationsPage() {
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [snoozedRows, setSnoozedRows] = React.useState<Set<string>>(() => new Set());
  const [activeTab, setActiveTab] = React.useState<NotificationTab>('all');
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const { toast } = useToast();

  const load = React.useCallback(async () => {
    setError(null);
    try { setItems(await listNotifications()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load notifications.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // Restore the persisted "Unread only" choice on mount.
  React.useEffect(() => {
    try { setUnreadOnly(parseUnreadOnly(window.localStorage.getItem(NOTIFICATION_UNREAD_STORAGE_KEY))); }
    catch { /* localStorage unavailable - keep the default */ }
  }, []);

  const toggleUnreadOnly = React.useCallback(() => {
    setUnreadOnly((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(NOTIFICATION_UNREAD_STORAGE_KEY, serializeUnreadOnly(next)); }
      catch { /* best-effort persistence */ }
      return next;
    });
  }, []);

  const setUnreadOnlyPersisted = React.useCallback((value: boolean) => {
    setUnreadOnly(value);
    try { window.localStorage.setItem(NOTIFICATION_UNREAD_STORAGE_KEY, serializeUnreadOnly(value)); }
    catch { /* best-effort persistence */ }
  }, []);

  const unread = (items ?? []).filter(i => !i.read && !snoozedRows.has(i.id)).length;

  async function onMarkOne(id: string) {
    setItems(prev => (prev ?? []).map(n => n.id === id ? { ...n, read: true } : n));
    try { await markNotificationRead(id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update notification.'); }
  }

  async function onMarkAll() {
    // Capture how many were unread BEFORE the optimistic update so the
    // confirming toast reports what it cleared. Mirrors the scoped tab toast,
    // using the 'all' tab phrasing ("8 marked read").
    const cleared = (items ?? []).filter(n => !n.read && !snoozedRows.has(n.id)).length;
    setBusy(true);
    setItems(prev => (prev ?? []).map(n => ({ ...n, read: true })));
    const title = markTabReadToastTitle(cleared, 'all');
    if (title) {
      toast({ id: 'mark-all-read', kind: 'success', title, durationMs: 3500 });
    }
    try { await markAllNotificationsRead(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark all read.'); }
    finally { setBusy(false); }
  }

  // Mark only the unread rows in the active tab/view read — distinct from the
  // global "Mark all read". Targets come from tabReadTargets so they're exactly
  // the rows on screen for the current tab (and unread-only constraint). Fires a
  // scoped confirming toast naming how many rows (and which tab) were cleared.
  async function onMarkTabRead(ids: readonly string[], tab: NotificationTab) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const cleared = ids.length;
    setBusy(true);
    setItems(prev => (prev ?? []).map(n => (idSet.has(n.id) ? { ...n, read: true } : n)));
    const title = markTabReadToastTitle(cleared, tab);
    if (title) {
      toast({ id: 'mark-tab-read', kind: 'success', title, durationMs: 3500 });
    }
    try {
      await Promise.all(ids.map(id => markNotificationRead(id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark those read.');
    } finally {
      setBusy(false);
    }
  }

  async function onSnooze(item: NotificationItem, choice: SnoozeChoice) {
    const when = snoozeUntil(choice);
    const iso = new Date(when).toISOString();
    // Collapse the row immediately so the list feels responsive.
    setSnoozedRows(prev => new Set(prev).add(item.id));
    setItems(prev => (prev ?? []).map(n => n.id === item.id ? { ...n, snoozedUntil: iso, read: true } : n));
    toast({
      id: `snooze-${item.id}`,
      kind: 'info',
      title: 'Reminder snoozed',
      description: `“${item.title}” will return ${snoozeLabel(choice)}.`,
      action: { label: 'Undo', run: () => unsnooze(item.id) },
      durationMs: 5000,
    });
    try {
      await snoozeNotification(item.id, iso);
    } catch (e) {
      // Roll back the optimistic collapse on failure.
      unsnooze(item.id);
      setError(e instanceof Error ? e.message : 'Could not snooze that reminder.');
    }
  }

  function unsnooze(id: string) {
    setSnoozedRows(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setItems(prev => (prev ?? []).map(n => n.id === id ? { ...n, snoozedUntil: null } : n));
  }

  if (error && !items) return <ErrorBox message={error} onRetry={load} />;

  const notSnoozed = (items ?? []).filter(n => !snoozedRows.has(n.id));
  const counts = countByTab(notSnoozed);
  const unreadInfo = summarizeUnread(notSnoozed, activeTab);
  const visible = applyNotificationFilters(notSnoozed, activeTab, unreadOnly);
  const dayGroups = groupByDay(visible, (n) => n.createdAt);
  const snoozedCount = snoozedRows.size;

  // When the active (non-All) tab is empty but unread notifications live in
  // other tabs, name where they are so an empty tab doesn't read as "all caught
  // up". Only relevant when the active tab itself has no rows (unread filter off
  // for the emptiness check, since the hint is about the tab being empty).
  const tabHint = crossTabUnreadHint(notSnoozed, activeTab);

  // Targets for the scoped "Mark these read" action — only the unread rows in
  // the active tab/view. Shown only on a sub-tab (not All, which already has the
  // global Mark all read) and when that tab actually has unread to clear.
  const tabReadIds = tabReadTargets(notSnoozed, activeTab, unreadOnly).ids;
  const markTabLabel =
    activeTab !== 'all' ? markTabReadLabel(notSnoozed, activeTab, unreadOnly) : null;

  // Unread-only empty state: a positive "all caught up" when the tab had unread
  // the user cleared, distinct from a barren no-rows inbox. Null when unread-only
  // is off or the tab is genuinely empty (the standard empty handles that).
  const caughtUp = caughtUpCopy(unreadOnly, unreadInfo);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {unread > 0 ? `${unread} unread` : 'You are all caught up.'}
            {snoozedCount > 0 && ` · ${snoozedCount} snoozed`}
          </p>
        </div>
        {unread > 0 && (
          <Btn variant="secondary" size="md" onClick={onMarkAll} disabled={busy}>
            {busy ? 'Marking' : 'Mark all read'}
          </Btn>
        )}
      </header>

      {/* Filter tabs + unread-only toggle */}
      {items !== null && notSnoozed.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Filter notifications">
          {NOTIFICATION_TABS.map(t => {
            const c = counts[t.tab];
            const active = activeTab === t.tab;
            return (
              <button
                key={t.tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.tab)}
                className={`inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors ${
                  active
                    ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                    : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
                }`}
              >
                {t.label}
                {c.total > 0 && (
                  <span
                    className={`tabular text-[10.5px] min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full ${
                      c.unread > 0
                        ? 'bg-[var(--accent)] text-[var(--bg-elev)]'
                        : active ? 'bg-[var(--bg-elev)] text-[var(--ink-muted)]' : 'bg-[var(--bg-sunk)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {c.unread > 0 ? c.unread : c.total}
                  </span>
                )}
              </button>
            );
          })}
          </div>
          {/* Per-tab actions: scoped "Mark these read" + the unread-only toggle.
              The scoped action is distinct from the header's global Mark all
              read — it only clears the unread rows in the active sub-tab. */}
          <div className="flex items-center gap-2 shrink-0">
            {markTabLabel && (
              <button
                type="button"
                onClick={() => onMarkTabRead(tabReadIds, activeTab)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border whitespace-nowrap transition-colors border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] disabled:opacity-50 disabled:pointer-events-none"
              >
                <CheckCircle size={13} />
                {markTabLabel}
              </button>
            )}
            {/* Unread-only toggle — only when the active tab actually has read rows
                to hide, so an all-unread tab doesn't show a no-op control. */}
            {unreadInfo.hasRead && (
              <button
                type="button"
                onClick={toggleUnreadOnly}
                aria-pressed={unreadOnly}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border whitespace-nowrap transition-colors ${
                  unreadOnly
                    ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                    : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
                }`}
              >
                <BellRinging size={13} />
                Unread only
                <span className="tabular text-[10.5px] min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-[var(--bg-sunk)] text-[var(--ink-muted)]">
                  {unreadInfo.unreadInTab}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {items === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : visible.length === 0 ? (
        <Empty
          icon={<Bell size={32} weight="duotone" />}
          title={
            caughtUp
              ? caughtUp.title
              : notSnoozed.length > 0
              ? 'Nothing in this tab'
              : snoozedCount > 0 ? 'Nothing for now' : 'No notifications yet'
          }
          description={
            caughtUp
              ? caughtUp.description
              : tabHint && !unreadOnly
              ? `Nothing here, but you have ${tabHint.message}.`
              : notSnoozed.length > 0
              ? 'Try another filter to see the rest of your inbox.'
              : snoozedCount > 0 ? 'Snoozed reminders will resurface at their scheduled time.' : 'Reminders and refill alerts appear here.'
          }
          action={
            caughtUp ? (
              <button type="button" onClick={() => setUnreadOnlyPersisted(false)} className="text-sm text-brand-600 hover:underline">
                Show all
              </button>
            ) : tabHint && !unreadOnly ? (
              <Btn size="sm" variant="primary" onClick={() => setActiveTab(tabHint.tab)}>
                {`Go to ${tabHint.label}`}
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {dayGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div
                className="sticky top-2 z-10 flex items-center gap-2 px-1"
              >
                <span className="eyebrow">{group.label}</span>
                <span className="text-[11px] tabular text-[var(--ink-muted)]">
                  {group.items.length}
                </span>
                {dayGroupUnreadLabel(group.items) && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] tabular font-medium"
                    style={{ color: 'var(--accent-ink)' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
                    {dayGroupUnreadLabel(group.items)}
                  </span>
                )}
                <span className="flex-1 h-px" style={{ background: 'var(--line-soft)' }} />
              </div>
              <Surface>
                <ul>
                  {group.items.map(n => (
                    <NotificationRow
                      key={n.id}
                      item={n}
                      onRead={() => onMarkOne(n.id)}
                      onSnooze={(choice) => onSnooze(n, choice)}
                    />
                  ))}
                </ul>
              </Surface>
            </section>
          ))}
        </div>
      )}

      {error && items && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}

function NotificationRow({
  item,
  onRead,
  onSnooze,
}: {
  item: NotificationItem;
  onRead: () => void;
  onSnooze: (choice: SnoozeChoice) => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLLIElement | null>(null);

  // Close the popover on outside click / Escape.
  React.useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const Icon = item.kind === 'refill' ? PillIcon
    : item.kind === 'caregiver' ? Users
    : item.kind === 'system' ? CheckCircle
    : BellRinging;

  const snoozable = item.kind === 'reminder' || item.kind === 'refill';

  const content = (
    <div className="flex items-start gap-3 p-3 w-full">
      <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
        item.read ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-500' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
      }`}>
        <Icon size={18} weight="duotone" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm truncate ${item.read ? 'text-neutral-500 dark:text-neutral-400' : 'font-medium'}`}>
            {item.title}
          </span>
          {!item.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" aria-label="Unread" />}
        </div>
        {item.body && (
          <div className={`text-xs mt-0.5 ${item.read ? 'text-neutral-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
            {item.body}
          </div>
        )}
        <div className="text-[11px] text-neutral-400 mt-1">{formatDate(item.createdAt)}</div>
      </div>
    </div>
  );

  return (
    <li
      ref={rootRef}
      className="relative border-b border-neutral-100 dark:border-neutral-900 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition-colors"
    >
      <div className="flex items-start">
        <div className="flex-1 min-w-0">
          {item.href ? <Link href={item.href}>{content}</Link> : content}
        </div>
        <div className="flex items-center gap-1 pr-3 pt-3 shrink-0">
          {snoozable && (
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
            >
              <Clock size={13} /> Snooze
            </button>
          )}
          {!item.read && (
            <button
              onClick={(e) => { e.preventDefault(); onRead(); }}
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 h-7 px-2"
              aria-label="Mark read"
            >
              Mark read
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-3 top-12 z-30 w-56 p-1.5 anim-toast-in sheet"
          style={{ boxShadow: '0 16px 34px -12px rgba(0,0,0,0.26), 0 4px 10px -4px rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 eyebrow">
            <Moon size={12} /> Snooze until
          </div>
          {SNOOZE_OPTIONS.map(opt => (
            <button
              key={opt.choice}
              role="menuitem"
              type="button"
              onClick={() => { setMenuOpen(false); onSnooze(opt.choice); }}
              className="w-full text-left flex items-center justify-between gap-2 px-2.5 h-9 rounded-[10px] text-[13px] text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
            >
              <span>{opt.label}</span>
              <span className="text-[11px] tabular text-[var(--ink-muted)]">
                {timeHint(opt.choice)}
              </span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function timeHint(choice: SnoozeChoice): string {
  const when = snoozeUntil(choice);
  const d = new Date(when);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (choice === '1h' || choice === '3h') return time;
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}
