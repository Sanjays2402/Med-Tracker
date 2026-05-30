'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Pill as PillIcon } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, formatTime, formatDate } from '../../../components/uikit';
import { listTodayDoses, logDose } from '../../../lib/data';
import type { DoseEvent } from '../../../lib/types';

export default function UpcomingPage() {
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setDoses(await listTodayDoses()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function take(id: string) {
    try {
      await logDose(id, 'taken');
      setDoses(prev => (prev ?? []).map(d => d.id === id ? { ...d, status: 'taken', takenAt: new Date().toISOString() } : d));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not log.'); }
  }

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  const upcoming = (doses ?? []).filter(d => d.status === 'pending').sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  return (
    <div className="space-y-6">
      <header>
        <div className="eyebrow">still to come</div>
        <h1 className="display text-[36px] leading-none tracking-tight mt-1">Upcoming</h1>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">Doses still pending today.</p>
      </header>

      {doses === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : upcoming.length === 0 ? (
        <Empty
          icon={<Bell size={28} />}
          title="Pillbox is closed for today"
          description="Every dose for today is logged. We'll line tomorrow up overnight."
          action={<Link href="/today"><Btn size="sm">Open today</Btn></Link>}
        />
      ) : (
        <Surface>
          <ul>
            {upcoming.map(d => (
              <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <PillIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/medications/${d.medicationId}`} className="text-sm font-medium hover:underline">{d.medicationName} <span className="text-neutral-500 font-normal">{d.strength}</span></Link>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                    <Pill tone="info">{formatTime(d.scheduledAt)}</Pill>
                    <span>{formatDate(d.scheduledAt)}</span>
                  </div>
                </div>
                <Btn size="sm" variant="primary" onClick={() => take(d.id)}>Take</Btn>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
