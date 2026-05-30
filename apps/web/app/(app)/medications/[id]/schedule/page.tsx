'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Clock } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Section } from '../../../../../components/uikit';
import { getMedication, listSchedules } from '../../../../../lib/data';
import type { Medication, ScheduleEntry } from '../../../../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MedicationSchedulePage() {
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [med, setMed] = React.useState<Medication | null | undefined>(undefined);
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [m, s] = await Promise.all([getMedication(id), listSchedules()]);
      setMed(m);
      setSchedules(s.filter(x => x.medicationId === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load schedule.');
    }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !schedules) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Link href={`/medications/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Back to medication
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {med ? `${med.name} schedule` : 'Schedule'}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          When this medication should be taken.
        </p>
      </header>

      {schedules === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : schedules.length === 0 ? (
        <Empty
          icon={<Calendar size={32} weight="duotone" />}
          title="No schedule set"
          description="Add a schedule to get reminders and adherence tracking."
        />
      ) : (
        schedules.map(s => {
          const allDays = !s.daysOfWeek || s.daysOfWeek.length === 7;
          return (
            <Section key={s.id} title={s.notes || 'Recurring schedule'}>
              <Surface>
                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">Times</div>
                    <div className="flex flex-wrap gap-2">
                      {s.times.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm">
                          <Clock size={12} className="text-neutral-400" />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">Days</div>
                    {allDays ? (
                      <div className="text-sm">Every day</div>
                    ) : (
                      <div className="flex gap-1.5">
                        {DAYS.map((d, i) => {
                          const active = s.daysOfWeek?.includes(i);
                          return (
                            <span
                              key={d}
                              className={`w-9 h-9 rounded-md flex items-center justify-center text-xs font-medium ${
                                active
                                  ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30'
                                  : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400'
                              }`}
                            >
                              {d}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {(s.startDate || s.endDate) && (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {s.startDate && <>Starts {new Date(s.startDate).toLocaleDateString()}</>}
                      {s.startDate && s.endDate && ' · '}
                      {s.endDate && <>Ends {new Date(s.endDate).toLocaleDateString()}</>}
                    </div>
                  )}
                </div>
              </Surface>
            </Section>
          );
        })
      )}
    </div>
  );
}
