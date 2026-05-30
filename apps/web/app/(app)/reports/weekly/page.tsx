'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Section } from '../../../../components/uikit';
import { listDosesForDate } from '../../../../lib/data';
import type { DoseEvent } from '../../../../lib/types';

interface DayStat { iso: string; weekday: string; label: string; taken: number; total: number; }

function lastNDays(n: number) {
  const out: { iso: string; weekday: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
  }
  return out;
}

export default function WeeklyReportPage() {
  const days = React.useMemo(() => lastNDays(7), []);
  const [stats, setStats] = React.useState<DayStat[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const results = await Promise.all(days.map(async d => {
        const doses: DoseEvent[] = await listDosesForDate(d.iso);
        const taken = doses.filter(x => x.status === 'taken').length;
        return { ...d, taken, total: doses.length };
      }));
      setStats(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load weekly report.');
    }
  }, [days]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !stats) return <ErrorBox message={error} onRetry={load} />;

  const totalTaken = stats?.reduce((s, d) => s + d.taken, 0) ?? 0;
  const totalScheduled = stats?.reduce((s, d) => s + d.total, 0) ?? 0;
  const pct = totalScheduled ? Math.round((totalTaken / totalScheduled) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Reports
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly report</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Last 7 days, {totalTaken} of {totalScheduled} doses taken ({pct}%).
        </p>
      </header>

      {stats === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : (
        <Section title="Day by day">
          <Surface>
            <div className="p-4 space-y-3">
              {stats.map(d => {
                const dayPct = d.total ? Math.round((d.taken / d.total) * 100) : 0;
                return (
                  <div key={d.iso}>
                    <Link href={`/history/${d.iso}`} className="flex items-baseline justify-between text-xs mb-1 hover:underline">
                      <span className="font-medium">{d.weekday}, {d.label}</span>
                      <span className="text-neutral-500 dark:text-neutral-400">{d.taken}/{d.total} · {dayPct}%</span>
                    </Link>
                    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          dayPct >= 80 ? 'bg-emerald-500' : dayPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${dayPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </Section>
      )}
    </div>
  );
}
