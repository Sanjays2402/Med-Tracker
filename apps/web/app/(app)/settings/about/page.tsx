'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, Heart } from '@med/icons';
import { Surface, Section } from '../../../../components/uikit';

interface Health { api: 'up' | 'down' | 'unknown'; web: 'up'; version?: string; }

export default function AboutSettingsPage() {
  const [health, setHealth] = React.useState<Health>({ api: 'unknown', web: 'up' });
  const buildDate = React.useMemo(() => new Date().toLocaleDateString(undefined, { dateStyle: 'long' }), []);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/version');
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          setHealth(h => ({ ...h, version: (data as any).version ?? '0.1.0' }));
        }
      } catch {}
      try {
        const res = await fetch('/api/health');
        setHealth(h => ({ ...h, api: res.ok ? 'up' : 'down' }));
      } catch {
        setHealth(h => ({ ...h, api: 'down' }));
      }
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Settings
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <Info size={24} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">About Med-Tracker</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Build info and helpful links.</p>
        </div>
      </header>

      <Section title="Build">
        <Surface>
          <ul>
            <Row label="Version" value={health.version ?? '0.1.0'} />
            <Row label="Build date" value={buildDate} />
            <Row label="Web" value={<StatusDot status={health.web} />} />
            <Row label="API" value={<StatusDot status={health.api} />} />
          </ul>
        </Surface>
      </Section>

      <Section title="Resources">
        <Surface>
          <ul>
            <LinkRow href="/changelog" label="Changelog" />
            <LinkRow href="/privacy" label="Privacy policy" />
            <LinkRow href="/terms" label="Terms of service" />
            <LinkRow href="/security" label="Security overview" />
            <LinkRow href="/contact" label="Contact support" />
          </ul>
        </Surface>
      </Section>

      <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
        Made with <Heart size={11} weight="duotone" className="text-red-500" /> for people who take medications.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
      <span className="text-sm flex-1">{label}</span>
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{value}</span>
    </li>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <li className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
      <Link href={href} className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
        <span className="text-sm flex-1">{label}</span>
        <span className="text-xs text-neutral-400">›</span>
      </Link>
    </li>
  );
}

function StatusDot({ status }: { status: 'up' | 'down' | 'unknown' }) {
  const color = status === 'up' ? 'bg-emerald-500' : status === 'down' ? 'bg-red-500' : 'bg-neutral-300';
  const label = status === 'up' ? 'Online' : status === 'down' ? 'Offline' : 'Checking';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
