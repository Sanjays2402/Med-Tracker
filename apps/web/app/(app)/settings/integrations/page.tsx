'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Cloud, Heartbeat, Pill as PillIcon, Heartbeat as Apple } from '@med/icons';
import { Surface, Section, Btn } from '../../../../components/uikit';

interface Integration { id: string; name: string; desc: string; icon: React.ReactNode; connected: boolean; }

const INITIAL: Integration[] = [
  { id: 'apple-health', name: 'Apple Health', desc: 'Sync medications and adherence to Apple Health.', icon: <Apple size={18} weight="duotone" />, connected: false },
  { id: 'google-fit', name: 'Google Fit', desc: 'Sync vitals and medication events.', icon: <Heartbeat size={18} weight="duotone" />, connected: false },
  { id: 'cvs', name: 'CVS Pharmacy', desc: 'Auto refill requests and pickup notifications.', icon: <PillIcon size={18} weight="duotone" />, connected: true },
  { id: 'icloud', name: 'iCloud backup', desc: 'Daily encrypted backups to iCloud.', icon: <Cloud size={18} weight="duotone" />, connected: false },
];

const STORAGE_KEY = 'med:integrations';

export default function IntegrationsPage() {
  const [items, setItems] = React.useState<Integration[]>(INITIAL);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, boolean>;
        setItems(prev => prev.map(i => ({ ...i, connected: map[i.id] ?? i.connected })));
      }
    } catch {}
  }, []);

  function toggle(id: string) {
    setItems(prev => {
      const next = prev.map(i => i.id === id ? { ...i, connected: !i.connected } : i);
      try {
        const map = Object.fromEntries(next.map(i => [i.id, i.connected]));
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch {}
      return next;
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Settings
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Connect Med-Tracker to the services you already use.
        </p>
      </header>

      <Section title="Available">
        <Surface>
          <ul>
            {items.map(i => (
              <li key={i.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                  {i.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{i.desc}</div>
                </div>
                <Btn variant={i.connected ? 'secondary' : 'primary'} size="sm" onClick={() => toggle(i.id)}>
                  {i.connected ? 'Disconnect' : 'Connect'}
                </Btn>
              </li>
            ))}
          </ul>
        </Surface>
      </Section>
    </div>
  );
}
