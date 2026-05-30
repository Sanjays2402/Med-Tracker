'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Clock, Pill as PillIcon } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../../components/uikit';
import { listDosesForDate } from '../../../../lib/data';
import type { DoseEvent } from '../../../../lib/types';

export default function HistoryDatePage() {
  const routed = useParams<{ date: string }>();
  const date = routed?.date ?? '';
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!date) return;
    setError(null);
    try { setDoses(await listDosesForDate(date)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load history.'); }
  }, [date]);
  React.useEffect(() => { void load(); }, [load]);

  const summary = React.useMemo(() => {
    if (!doses) return null;
    const taken = doses.filter(d => d.status === 'taken').length;
    const skipped = doses.filter(d => d.status === 'skipped').length;
    const missed = doses.filter(d => d.status === 'missed').length;
    return { taken, skipped, missed, total: doses.length };
  }, [doses]);

  const prettyDate = React.useMemo(() => {
    if (!date) return '';
    const d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [date]);

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Link href="/history" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        History
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{prettyDate || date}</h1>
        {summary && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {summary.taken} taken · {summary.missed} missed · {summary.skipped} skipped · {summary.total} scheduled
          </p>
        )}
      </header>

      {doses === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : doses.length === 0 ? (
        <Empty
          icon={<Clock size={32} weight="duotone" />}
          title="No doses scheduled"
          description="There were no scheduled doses on this day."
        />
      ) : (
        <Section title="Doses">
          <Surface>
            <ul>
              {doses
                .slice()
                .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
                .map(d => (
                  <li key={d.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                    <StatusIcon status={d.status} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/medications/${d.medicationId}`} className="text-sm font-medium hover:underline truncate block">
                        {d.medicationName} {d.strength && <span className="text-neutral-500 dark:text-neutral-400 font-normal">· {d.strength}</span>}
                      </Link>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Scheduled {new Date(d.scheduledAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        {d.takenAt && d.status === 'taken' && ` · Taken ${new Date(d.takenAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                      </div>
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
