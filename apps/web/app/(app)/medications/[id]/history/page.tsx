'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Clock, Pill as PillIcon } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Section } from '../../../../../components/uikit';
import { getMedication, listDosesForDate } from '../../../../../lib/data';
import type { DoseEvent, Medication } from '../../../../../lib/types';

function lastNDays(n: number) {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

export default function MedicationHistoryPage() {
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [med, setMed] = React.useState<Medication | null | undefined>(undefined);
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [m, days] = await Promise.all([
        getMedication(id),
        Promise.all(lastNDays(14).map(d => listDosesForDate(d))),
      ]);
      setMed(m);
      const flat = days.flat().filter(d => d.medicationId === id);
      flat.sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
      setDoses(flat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Link href={`/medications/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Back to medication
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {med ? `${med.name} history` : 'Dose history'}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Last 14 days of scheduled doses.</p>
      </header>

      {doses === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : doses.length === 0 ? (
        <Empty
          icon={<Clock size={32} weight="duotone" />}
          title="No history yet"
          description="Once you log doses for this medication they appear here."
        />
      ) : (
        <Section title={`${doses.length} entries`}>
          <Surface>
            <ul>
              {doses.map(d => (
                <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <StatusIcon status={d.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {new Date(d.scheduledAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                    {d.takenAt && d.status === 'taken' && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Taken {new Date(d.takenAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                  <StatusPill status={d.status} />
                </li>
              ))}
            </ul>
          </Surface>
        </Section>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: DoseEvent['status'] }) {
  const base = 'w-9 h-9 rounded-md flex items-center justify-center shrink-0';
  if (status === 'taken') return <div className={`${base} bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400`}><CheckCircle size={18} weight="duotone" /></div>;
  if (status === 'missed') return <div className={`${base} bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400`}><XCircle size={18} weight="duotone" /></div>;
  if (status === 'skipped') return <div className={`${base} bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400`}><PillIcon size={18} weight="duotone" /></div>;
  return <div className={`${base} bg-neutral-100 dark:bg-neutral-900 text-neutral-500`}><Clock size={18} weight="duotone" /></div>;
}

function StatusPill({ status }: { status: DoseEvent['status'] }) {
  if (status === 'taken') return <Pill tone="ok">Taken</Pill>;
  if (status === 'missed') return <Pill tone="danger">Missed</Pill>;
  if (status === 'skipped') return <Pill tone="warn">Skipped</Pill>;
  return <Pill tone="neutral">Pending</Pill>;
}
