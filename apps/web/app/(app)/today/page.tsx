'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Bell, CalendarCheck } from '@med/icons';
import { Btn, Surface, Section, Empty, ErrorBox, SkeletonRow, Pill, formatTime } from '../../../components/uikit';
import { listTodayDoses, logDose, undoDose } from '../../../lib/data';
import type { DoseEvent } from '../../../lib/types';

export default function TodayPage() {
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setDoses(await listTodayDoses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today.');
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function act(id: string, status: 'taken' | 'skipped') {
    setBusy(id);
    try {
      await logDose(id, status);
      setDoses(prev => (prev ?? []).map(d => d.id === id ? { ...d, status, takenAt: status === 'taken' ? new Date().toISOString() : d.takenAt } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log dose.');
    } finally {
      setBusy(null);
    }
  }

  async function undo(id: string) {
    setBusy(id);
    try {
      await undoDose(id);
      setDoses(prev => (prev ?? []).map(d => d.id === id ? { ...d, status: 'pending', takenAt: undefined } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo dose.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  const groups: Record<string, DoseEvent[]> = { Morning: [], Afternoon: [], Evening: [], Night: [] };
  for (const d of doses ?? []) {
    const h = new Date(d.scheduledAt).getHours();
    const k = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
    (groups[k] as DoseEvent[]).push(d);
  }

  const total = doses?.length ?? 0;
  const taken = (doses ?? []).filter(d => d.status === 'taken').length;
  const pct = total ? Math.round((taken / total) * 100) : 0;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Progress</div>
          <div className="text-2xl font-semibold tabular-nums">{taken} / {total}</div>
        </div>
      </header>

      <Surface className="p-4">
        <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{pct}% complete</div>
      </Surface>

      {doses === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : total === 0 ? (
        <Empty
          icon={<Bell size={32} />}
          title="Nothing scheduled for today"
          description="Add a medication to begin tracking doses."
          action={<Link href="/medications/new"><Btn variant="primary" size="sm">Add medication</Btn></Link>}
        />
      ) : (
        Object.entries(groups).map(([label, items]) =>
          items.length === 0 ? null : (
            <Section key={label} title={label}>
              <Surface>
                <ul>
                  {items.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).map(d => (
                    <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                      <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                        <PillIcon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          <Link href={`/medications/${d.medicationId}`} className="hover:underline">{d.medicationName}</Link>
                          {d.strength && <span className="text-neutral-500 font-normal"> {d.strength}</span>}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
                          <span>{formatTime(d.scheduledAt)}</span>
                          {d.status === 'taken' && <Pill tone="ok"><CalendarCheck size={12} /> taken {d.takenAt ? formatTime(d.takenAt) : ''}</Pill>}
                          {d.status === 'skipped' && <Pill tone="warn">skipped</Pill>}
                          {d.status === 'missed' && <Pill tone="danger">missed</Pill>}
                        </div>
                      </div>
                      {d.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Btn size="sm" variant="secondary" disabled={busy === d.id} onClick={() => act(d.id, 'skipped')}>Skip</Btn>
                          <Btn size="sm" variant="primary" disabled={busy === d.id} onClick={() => act(d.id, 'taken')}>Take</Btn>
                        </div>
                      ) : (
                        <Btn size="sm" variant="ghost" disabled={busy === d.id} onClick={() => undo(d.id)}>Undo</Btn>
                      )}
                    </li>
                  ))}
                </ul>
              </Surface>
            </Section>
          )
        )
      )}

      {error && doses && <ErrorBox message={error} onRetry={() => setError(null)} />}
    </div>
  );
}
