'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChartBar, ChartLine, FileArrowDown } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Section } from '../../../components/uikit';
import { getAdherence } from '../../../lib/data';
import type { AdherenceSummary } from '../../../lib/types';

export default function ReportsPage() {
  const [summary, setSummary] = React.useState<AdherenceSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setSummary(await getAdherence()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load adherence.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !summary) return <ErrorBox message={error} onRetry={load} />;

  const pct = summary ? Math.round((summary.taken / Math.max(summary.scheduled, 1)) * 100) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Adherence trends across windows. Share with your clinician.
        </p>
      </header>

      {summary === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label={`Adherence (${summary.windowDays}d)`} value={`${pct}%`} sub={`${summary.taken} of ${summary.scheduled} doses`} />
          <Stat label="Streak" value={`${summary.streakDays}d`} sub="Consecutive days on track" />
          <Stat label="Trend" value={trendLabel(summary.trend)} sub="Vs previous window" />
        </div>
      )}

      <Section title="Browse reports">
        <Surface>
          <ul>
            <ReportLink href="/reports/weekly" icon={<ChartLine size={18} weight="duotone" />} title="Weekly report" desc="Day by day adherence for the last 7 days." />
            <ReportLink href="/reports/monthly" icon={<ChartBar size={18} weight="duotone" />} title="Monthly report" desc="Roll up of the last 30 days." />
            <ReportLink href="/reports/adherence" icon={<ChartBar size={18} weight="duotone" />} title="Adherence detail" desc="MPR and PDC across your regimen." />
            <ReportLink href="/reports/export" icon={<FileArrowDown size={18} weight="duotone" />} title="Export" desc="Download CSV, JSON, ICS, or PDF." />
          </ul>
        </Surface>
      </Section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Surface>
      <div className="p-4">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
        <div className="text-2xl font-semibold tracking-tight mt-1">{value}</div>
        {sub && <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</div>}
      </div>
    </Surface>
  );
}

function ReportLink({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <li className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
      <Link href={href} className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
        <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{desc}</div>
        </div>
      </Link>
    </li>
  );
}

function trendLabel(t: 'up' | 'down' | 'flat'): string {
  if (t === 'up') return 'Improving';
  if (t === 'down') return 'Declining';
  return 'Steady';
}
