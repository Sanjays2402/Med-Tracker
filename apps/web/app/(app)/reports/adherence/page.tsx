'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ChartBar } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Section } from '../../../../components/uikit';
import { getAdherence, listMedications, listDosesForDate } from '../../../../lib/data';
import type { AdherenceSummary, Medication, DoseEvent } from '../../../../lib/types';
import {
  DEFAULT_ADHERENCE_WINDOW,
  windowDays as daysForWindow,
  windowCaption,
  type AdherenceWindowKey,
} from '../../../../lib/adherence-window';
import { WindowPicker } from '../../../../components/WindowPicker';

interface PerMed { medication: Medication; taken: number; scheduled: number; }

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

export default function ReportsAdherencePage() {
  const [summary, setSummary] = React.useState<AdherenceSummary | null>(null);
  const [perMed, setPerMed] = React.useState<PerMed[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [windowKey, setWindowKey] = React.useState<AdherenceWindowKey>(DEFAULT_ADHERENCE_WINDOW);
  const windowDays = daysForWindow(windowKey);

  const load = React.useCallback(async () => {
    setError(null);
    setPerMed(null);
    try {
      const [s, meds] = await Promise.all([getAdherence(), listMedications()]);
      setSummary(s);

      const days = lastNDays(windowDays);
      const buckets = new Map<string, { taken: number; scheduled: number }>();
      const allDoses: DoseEvent[][] = await Promise.all(days.map(d => listDosesForDate(d)));
      for (const list of allDoses) {
        for (const d of list) {
          const cur = buckets.get(d.medicationId) ?? { taken: 0, scheduled: 0 };
          cur.scheduled += 1;
          if (d.status === 'taken') cur.taken += 1;
          buckets.set(d.medicationId, cur);
        }
      }
      const rows: PerMed[] = meds
        .map(m => ({ medication: m, ...(buckets.get(m.id) ?? { taken: 0, scheduled: 0 }) }))
        .filter(r => r.scheduled > 0)
        .sort((a, b) => (b.taken / b.scheduled) - (a.taken / a.scheduled));
      setPerMed(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load adherence.');
    }
  }, [windowDays]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !summary) return <ErrorBox message={error} onRetry={load} />;

  const overallPct = summary ? Math.round((summary.taken / Math.max(summary.scheduled, 1)) * 100) : null;

  return (
    <div className="space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Reports
      </Link>

      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Adherence detail</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Per-medication MPR-style breakdown over the chosen window.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500 dark:text-neutral-400 hidden sm:inline">{windowCaption(windowKey)}</span>
          <WindowPicker value={windowKey} onChange={setWindowKey} size="md" />
        </div>
      </header>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label={`Overall (${summary.windowDays}d)`} value={`${overallPct}%`} sub={`${summary.taken}/${summary.scheduled} doses`} />
          <Stat label="Streak" value={`${summary.streakDays}d`} sub="Consecutive on track" />
          <Stat label="Trend" value={summary.trend === 'up' ? 'Improving' : summary.trend === 'down' ? 'Declining' : 'Steady'} />
        </div>
      )}

      {perMed === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : perMed.length === 0 ? (
        <Surface>
          <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No scheduled doses in this window yet.
          </div>
        </Surface>
      ) : (
        <Section title={`Per medication, last ${windowDays} days`}>
          <Surface>
            <div className="p-4 space-y-4">
              {perMed.map(row => {
                const pct = Math.round((row.taken / row.scheduled) * 100);
                return (
                  <div key={row.medication.id}>
                    <Link href={`/medications/${row.medication.id}`} className="flex items-baseline justify-between text-xs mb-1 hover:underline">
                      <span className="font-medium">
                        {row.medication.name}
                        {row.medication.strength && <span className="text-neutral-500 dark:text-neutral-400 font-normal"> · {row.medication.strength}</span>}
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400">{row.taken}/{row.scheduled} · {pct}%</span>
                    </Link>
                    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden">
                      <div className={`h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
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
