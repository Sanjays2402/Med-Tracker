'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, BellRinging, CheckCircle, Pill as PillIcon, Warning, Users } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Btn, formatDate } from '../../../components/uikit';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../../../lib/data';
import type { NotificationItem } from '../../../lib/types';

export default function NotificationsPage() {
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try { setItems(await listNotifications()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load notifications.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const unread = (items ?? []).filter(i => !i.read).length;

  async function onMarkOne(id: string) {
    setItems(prev => (prev ?? []).map(n => n.id === id ? { ...n, read: true } : n));
    try { await markNotificationRead(id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update notification.'); }
  }

  async function onMarkAll() {
    setBusy(true);
    setItems(prev => (prev ?? []).map(n => ({ ...n, read: true })));
    try { await markAllNotificationsRead(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not mark all read.'); }
    finally { setBusy(false); }
  }

  if (error && !items) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {unread > 0 ? `${unread} unread` : 'You are all caught up.'}
          </p>
        </div>
        {unread > 0 && (
          <Btn variant="secondary" size="md" onClick={onMarkAll} disabled={busy}>
            {busy ? 'Marking' : 'Mark all read'}
          </Btn>
        )}
      </header>

      {items === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : items.length === 0 ? (
        <Empty
          icon={<Bell size={32} weight="duotone" />}
          title="No notifications yet"
          description="Reminders and refill alerts appear here."
        />
      ) : (
        <Surface>
          <ul>
            {items.map(n => (
              <NotificationRow key={n.id} item={n} onRead={() => onMarkOne(n.id)} />
            ))}
          </ul>
        </Surface>
      )}

      {error && items && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: () => void }) {
  const Icon = item.kind === 'refill' ? PillIcon
    : item.kind === 'caregiver' ? Users
    : item.kind === 'system' ? CheckCircle
    : BellRinging;

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
      {!item.read && (
        <button
          onClick={(e) => { e.preventDefault(); onRead(); }}
          className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 shrink-0"
          aria-label="Mark read"
        >
          Mark read
        </button>
      )}
    </div>
  );

  return (
    <li className="border-b border-neutral-100 dark:border-neutral-900 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition-colors">
      {item.href ? <Link href={item.href}>{content}</Link> : content}
    </li>
  );
}
