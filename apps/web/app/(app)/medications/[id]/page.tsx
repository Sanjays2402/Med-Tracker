'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pill as PillIcon, Calendar, ChartBar, Bell, CalendarCheck } from '@med/icons';
import { Btn, Surface, Section, ErrorBox, SkeletonRow, Pill, StatTile, formatTime, formatDate } from '../../../../components/uikit';
import { getMedication, listTodayDoses, listSchedules, listRefills, logDose, getAdherence } from '../../../../lib/data';
import type { Medication, DoseEvent, ScheduleEntry, Refill, AdherenceSummary } from '../../../../lib/types';

export default function MedicationDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [med, setMed] = React.useState<Medication | null>(null);
  const [doses, setDoses] = React.useState<DoseEvent[]>([]);
  const [schedules, setSchedules] = React.useState<ScheduleEntry[]>([]);
  const [refills, setRefills] = React.useState<Refill[]>([]);
  const [adherence, setAdherence] = React.useState<AdherenceSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [m, d, s, r, a] = await Promise.all([getMedication(id), listTodayDoses(), listSchedules(), listRefills(), getAdherence()]);
      setMed(m);
      setDoses(d.filter(x => x.medicationId === id));
      setSchedules(s.filter(x => x.medicationId === id));
      setRefills(r.filter(x => x.medicationId === id));
      setAdherence(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load medication.');
    } finally {
      setLoading(false);
    }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  async function quickTake(doseId: string) {
    try {
      await logDose(doseId, 'taken');
      setDoses(prev => prev.map(d => d.id === doseId ? { ...d, status: 'taken', takenAt: new Date().toISOString() } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log dose.');
    }
  }

  if (error && !med) return <ErrorBox message={error} onRetry={load} />;

  if (loading && !med) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      </div>
    );
  }

  if (!med) {
    return (
      <div className="space-y-4">
        <Link href="/medications" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">← Medications</Link>
        <ErrorBox message="Medication not found." />
      </div>
    );
  }

  // Per-med 7d view: scale the user's overall adherence window to a 7d slice for this med.
  // When the API exposes per-medication adherence we will switch to that endpoint.
  const window = adherence?.windowDays ?? 30;
  const scale = Math.min(1, 7 / window);
  const sched7d = Math.max(0, Math.round((adherence?.scheduled ?? 0) * scale / Math.max(1, ((adherence?.scheduled ?? 0) > 0 ? 1 : 1))));
  const taken7d = Math.round((adherence?.taken ?? 0) * scale);
  const sched7dEst = Math.round((adherence?.scheduled ?? 0) * scale);
  const adherencePct = sched7dEst > 0 ? Math.min(100, Math.round((taken7d / sched7dEst) * 100)) : 0;

  return (
    <div className="space-y-8">
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/medications" className="hover:text-neutral-900 dark:hover:text-neutral-100">Medications</Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">{med.name}</span>
      </div>

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
          <PillIcon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{med.name} <span className="text-neutral-500 font-normal">{med.strength}</span></h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{med.form ?? ''} {med.schedule ? `, ${med.schedule}` : ''}</p>
        </div>
      </header>

      {med.instructions && (
        <Surface className="p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Instructions</div>
          <p className="text-sm">{med.instructions}</p>
        </Surface>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Adherence 7d" value={sched7dEst > 0 ? `${adherencePct}%` : '—'} hint={sched7dEst > 0 ? `${taken7d} of ${sched7dEst} doses` : 'no data yet'} accent={adherencePct >= 90 ? 'ok' : adherencePct >= 70 ? 'warn' : 'danger'} />
        <StatTile label="On hand" value={med.remainingDoses ?? '—'} hint="doses remaining" accent={(med.remainingDoses ?? 0) < 10 ? 'danger' : (med.remainingDoses ?? 0) < 20 ? 'warn' : 'ok'} />
        <StatTile label="Refill in" value={`${med.refillThresholdDays ?? '—'}d`} hint="threshold" />
      </div>

      <Section title="Doses today">
        <Surface>
          {doses.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">No doses scheduled today.</div>
          ) : (
            <ul>
              {doses.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).map(d => (
                <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <Bell size={16} className="text-neutral-400" />
                  <div className="flex-1 text-sm">
                    {formatTime(d.scheduledAt)}
                    {d.status === 'taken' && <Pill tone="ok"><CalendarCheck size={12} /> taken</Pill>}
                    {d.status === 'skipped' && <Pill tone="warn">skipped</Pill>}
                  </div>
                  {d.status === 'pending' && <Btn size="sm" variant="primary" onClick={() => quickTake(d.id)}>Take</Btn>}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      <Section title="Schedule">
        <Surface>
          {schedules.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">No schedule configured.</div>
          ) : (
            <ul>
              {schedules.map(s => (
                <li key={s.id} className="p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 flex items-center gap-3">
                  <Calendar size={16} className="text-neutral-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.times.join(', ')}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{daysLabel(s.daysOfWeek)} {s.notes ? `, ${s.notes}` : ''}</div>
                  </div>
                  {s.endDate && <Pill tone="info">ends {formatDate(s.endDate)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      <Section title="Refills">
        <Surface>
          {refills.length === 0 ? (
            <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">No refills on file.</div>
          ) : (
            <ul>
              {refills.map(r => (
                <li key={r.id} className="p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 flex items-center gap-3">
                  <ChartBar size={16} className="text-neutral-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{r.pharmacy ?? 'Pharmacy not set'}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.daysSupply} day supply, refill by {formatDate(r.refillBy)}</div>
                  </div>
                  <Pill tone={r.status === 'needed' ? 'warn' : r.status === 'ready' ? 'ok' : 'info'}>{r.status.replace('_', ' ')}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </Section>

      {error && <ErrorBox message={error} onRetry={() => setError(null)} />}
    </div>
  );
}

function daysLabel(days?: number[]): string {
  if (!days || days.length === 7) return 'Every day';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map(d => names[d]).join(', ');
}
