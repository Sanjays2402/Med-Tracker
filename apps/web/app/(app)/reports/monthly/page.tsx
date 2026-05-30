'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Section } from '../../../../components/uikit';
import { listDosesForDate } from '../../../../lib/data';
import type { DoseEvent } from '../../../../lib/types';

interface DayStat { iso: string; day: number; taken: number; total: number; }

function lastNDays(n: number) {
  const out: { iso: string; day: number; weekday: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      day: d.getDate(),
      weekday: d.getDay(),
    });
  }
  return out;
}

export default function MonthlyReportPage() {
  const days = React.useMemo(() => lastNDays(30), []);
  const [stats, setStats] = React.useState<DayStat[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const results = await Promise.all(days.map(async d => {
        const doses: DoseEvent[] = await listDosesForDate(d.iso);
        const taken = doses.filter(x => x.status === 'taken').length;
        return { iso: d.iso, day: d.day, taken, total: doses.length };
      }));
      setStats(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load monthly report.');
    }
  }, [days]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !stats) return <ErrorBox message={error} onRetry={load} />;

  const totalTaken = stats?.reduce((s, d) => s + d.taken, 0) ?? 0;
  const totalScheduled = stats?.reduce((s, d) => s + d.total, 0) ?? 0;
  const pct = totalScheduled ? Math.round((totalTaken / totalScheduled) * 100) : 0;

  const goodDays = stats?.filter(d => d.total > 0 && d.taken / d.total >= 0.8).length ?? 0;
  const missedDays = stats?.filter(d => d.total > 0 && d.taken / d.total < 0.5).length ?? 0;

  return (
    <div className="space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Reports
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly report</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Last 30 days, {totalTaken} of {totalScheduled} doses taken ({pct}%).
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Adherence" value={`${pct}%`} />
        <StatCard label="Doses taken" value={String(totalTaken)} />
        <StatCard label="Strong days" value={String(goodDays)} sub="80% or higher" />
        <StatCard label="Weak days" value={String(missedDays)} sub="Below 50%" />
      </div>

      {stats === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : (
        <Section title="Daily heatmap">
          <Surface>
            <div className="p-4">
              <div className="grid grid-cols-10 gap-1.5">
                {stats.map(d => {
                  const dayPct = d.total ? d.taken / d.total : 0;
                  return (
                    <Link
                      key={d.iso}
                      href={`/history/${d.iso}`}
                      title={`${d.iso}: ${d.taken}/${d.total}`}
                      className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-medium hover:ring-2 hover:ring-brand-500/40 transition-all ${
                        d.total === 0 ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400'
                        : dayPct >= 0.9 ? 'bg-emerald-500/90 text-white'
                        : dayPct >= 0.7 ? 'bg-emerald-500/60 text-white'
                        : dayPct >= 0.5 ? 'bg-amber-500/70 text-white'
                        : 'bg-red-500/70 text-white'
                      }`}
                    >
                      {d.day}
                    </Link>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-4 text-[11px] text-neutral-500 dark:text-neutral-400">
                <Legend color="bg-emerald-500/90" label="≥90%" />
                <Legend color="bg-emerald-500/60" label="70-89%" />
                <Legend color="bg-amber-500/70" label="50-69%" />
                <Legend color="bg-red-500/70" label="<50%" />
              </div>
            </div>
          </Surface>
        </Section>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Surface>
      <div className="p-4">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
        <div className="text-xl font-semibold tracking-tight mt-1">{value}</div>
        {sub && <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</div>}
      </div>
    </Surface>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-2.5 h-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
