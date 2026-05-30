'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Bell, Flame, TrendingUp, Calendar, ChartBar } from '@med/icons';
import { Btn, Surface, StatTile, Section, Empty, ErrorBox, SkeletonRow, Pill, formatTime } from '../../../components/uikit';
import { getAdherence, listTodayDoses, listRefills, logDose } from '../../../lib/data';
import type { AdherenceSummary, DoseEvent, Refill } from '../../../lib/types';

export default function DashboardPage() {
  const [adherence, setAdherence] = React.useState<AdherenceSummary | null>(null);
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, d, r] = await Promise.all([getAdherence(), listTodayDoses(), listRefills()]);
      setAdherence(a);
      setDoses(d);
      setRefills(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const next = (doses ?? []).filter(d => d.status === 'pending').sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const pendingRefills = (refills ?? []).filter(r => r.status === 'needed');
  const takenToday = (doses ?? []).filter(d => d.status === 'taken').length;
  const totalToday = (doses ?? []).length;
  const todayPct = totalToday ? Math.round((takenToday / totalToday) * 100) : 0;
  const adherencePct = adherence && adherence.scheduled ? Math.round((adherence.taken / adherence.scheduled) * 100) : 0;

  async function quickTake(id: string) {
    try {
      await logDose(id, 'taken');
      setDoses(prev => (prev ?? []).map(d => d.id === id ? { ...d, status: 'taken', takenAt: new Date().toISOString() } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log dose.');
    }
  }

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Good {greeting()}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Here is where you stand today.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading && !adherence ? (
          <>
            <Surface className="p-4 h-24 animate-pulse" />
            <Surface className="p-4 h-24 animate-pulse" />
            <Surface className="p-4 h-24 animate-pulse" />
            <Surface className="p-4 h-24 animate-pulse" />
          </>
        ) : (
          <>
            <StatTile label="Today" value={`${takenToday} / ${totalToday}`} hint={`${todayPct}% of doses taken`} accent={todayPct >= 80 ? 'ok' : todayPct >= 50 ? 'warn' : 'danger'} />
            <StatTile label={`Adherence ${adherence?.windowDays ?? 30}d`} value={`${adherencePct}%`} hint={adherence ? `${adherence.taken} of ${adherence.scheduled} doses` : ''} accent={adherencePct >= 90 ? 'ok' : 'warn'} />
            <StatTile label="Streak" value={<span className="inline-flex items-center gap-1.5"><Flame size={20} /> {adherence?.streakDays ?? 0}d</span>} hint="days on schedule" />
            <StatTile label="Refills" value={pendingRefills.length} hint="needed this week" accent={pendingRefills.length > 0 ? 'warn' : 'ok'} />
          </>
        )}
      </div>

      <Section
        title="Up next today"
        action={<Link href="/today" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">View all</Link>}
      >
        <Surface>
          {loading && !doses ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : next.length === 0 ? (
            <Empty icon={<Bell size={28} />} title="You are all caught up" description="No more doses scheduled for today." />
          ) : (
            <ul>
              {next.slice(0, 5).map(d => (
                <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                    <PillIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{d.medicationName} {d.strength && <span className="text-neutral-500 font-normal">{d.strength}</span>}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{formatTime(d.scheduledAt)}</div>
                  </div>
                  <Btn size="sm" variant="primary" onClick={() => quickTake(d.id)}>Log</Btn>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title="Refills" action={<Link href="/refills" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">Manage</Link>}>
          <Surface>
            {loading && !refills ? (
              <><SkeletonRow /><SkeletonRow /></>
            ) : pendingRefills.length === 0 ? (
              <Empty icon={<ChartBar size={24} />} title="No refills needed" description="Everything is stocked for the next two weeks." />
            ) : (
              <ul>
                {pendingRefills.slice(0, 4).map(r => (
                  <li key={r.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.medicationName}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.daysSupply} day supply, {r.pharmacy ?? 'no pharmacy set'}</div>
                    </div>
                    <Pill tone={daysUntil(r.refillBy) <= 3 ? 'danger' : 'warn'}>by {new Date(r.refillBy).toLocaleDateString([], { month: 'short', day: 'numeric' })}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </Section>

        <Section title="This week" action={<Link href="/schedule" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">Open schedule</Link>}>
          <Surface className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Trending {adherence?.trend === 'up' ? 'up' : adherence?.trend === 'down' ? 'down' : 'flat'}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{adherencePct}% over the last {adherence?.windowDays ?? 30} days</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {Array.from({ length: 14 }).map((_, i) => {
                const intensity = Math.max(0, Math.min(1, 0.55 + Math.sin(i * 1.3) * 0.35));
                return (
                  <div key={i} className="h-8 rounded" style={{ background: `rgba(42,160,107,${0.15 + intensity * 0.55})` }} title={`Day ${i + 1}`} />
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>2 weeks ago</span><span>today</span>
            </div>
          </Surface>
        </Section>
      </div>

      {error && doses && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function daysUntil(iso: string): number {
  return Math.ceil((+new Date(iso) - Date.now()) / 86400000);
}
