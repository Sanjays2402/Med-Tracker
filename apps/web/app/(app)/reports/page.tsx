'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChartBar, ChartLine, FileArrowDown } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Section } from '../../../components/uikit';
import { getAdherence, getMedicationAdherence, type MedAdherenceRow } from '../../../lib/data';
import type { AdherenceSummary } from '../../../lib/types';
import { buildAdherenceBars, type AdherenceTone } from '../../../lib/adherence-bars';

const BAR_TONE_FILL: Record<AdherenceTone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};

export default function ReportsPage() {
  const [summary, setSummary] = React.useState<AdherenceSummary | null>(null);
  const [perMed, setPerMed] = React.useState<MedAdherenceRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [s, m] = await Promise.all([getAdherence(), getMedicationAdherence(30)]);
      setSummary(s);
      setPerMed(m);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load adherence.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !summary) return <ErrorBox message={error} onRetry={load} />;

  const pct = summary ? Math.round((summary.taken / Math.max(summary.scheduled, 1)) * 100) : null;
  const barData = perMed ? buildAdherenceBars(perMed) : null;

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

      <Section
        title="By medication"
        action={
          barData && barData.flaggedCount > 0 ? (
            <span className="text-[12px] text-[var(--danger)]">
              {barData.flaggedCount} below {70}%
            </span>
          ) : barData && barData.bars.length > 0 ? (
            <span className="text-[12px] text-[var(--ink-muted)]">last 30 days</span>
          ) : undefined
        }
      >
        {perMed === null ? (
          <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
        ) : barData && barData.bars.length > 0 ? (
          <Surface>
            <ul className="p-2 sm:p-3 space-y-2.5">
              {barData.bars.map((b) => (
                <li key={b.medicationId} className="flex items-center gap-3">
                  <Link
                    href={`/medications/${b.medicationId}`}
                    className="w-28 sm:w-36 shrink-0 text-[13px] font-medium truncate hover:underline"
                    title={b.medicationName}
                  >
                    {b.medicationName}
                  </Link>
                  <div
                    className="flex-1 h-5 rounded-full overflow-hidden"
                    style={{ background: 'var(--bg-sunk)' }}
                    role="meter"
                    aria-valuenow={b.empty ? undefined : b.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${b.medicationName} adherence`}
                  >
                    {!b.empty && (
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${b.width}%`, background: BAR_TONE_FILL[b.tone] }}
                      />
                    )}
                  </div>
                  <span
                    className="w-12 shrink-0 text-right text-[12.5px] tabular"
                    style={{ color: b.empty ? 'var(--ink-muted)' : BAR_TONE_FILL[b.tone] }}
                  >
                    {b.empty ? '—' : `${b.pct}%`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-4 pb-3 pt-1 flex flex-wrap items-center gap-4 text-[11.5px] text-[var(--ink-muted)]">
              <LegendDot color="var(--danger)" label="Below 70%" />
              <LegendDot color="var(--warn)" label="70-89%" />
              <LegendDot color="var(--ok)" label="90%+" />
              <span className="ml-auto">Worst adherence first.</span>
            </div>
          </Surface>
        ) : (
          <Surface>
            <div className="p-6 text-center text-[13px] text-[var(--ink-muted)]">
              No per-medication adherence yet. Log a few doses and this fills in.
            </div>
          </Surface>
        )}
      </Section>

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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
