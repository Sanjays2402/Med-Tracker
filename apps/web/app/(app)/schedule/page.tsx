'use client';

import * as React from 'react';
import Link from 'next/link';
import { Calendar, Pill as PillIcon, GridFour } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../components/uikit';
import { listSchedules } from '../../../lib/data';
import type { ScheduleEntry } from '../../../lib/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulePage() {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setSchedules(await listSchedules()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedule.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !schedules) return <ErrorBox message={error} onRetry={load} />;

  // Build a 7 day grid: day -> list of {time, name}
  const today = new Date();
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const grid: { date: Date; entries: { time: string; name: string; id: string; medId: string }[] }[] = weekDays.map(d => ({ date: d, entries: [] }));
  for (const s of schedules ?? []) {
    for (let i = 0; i < 7; i++) {
      const day = weekDays[i];
      const cell = grid[i];
      if (!day || !cell) continue;
      const dow = day.getDay();
      if (s.daysOfWeek && !s.daysOfWeek.includes(dow)) continue;
      if (s.endDate && +day > +new Date(s.endDate)) continue;
      for (const t of s.times) cell.entries.push({ time: t, name: s.medicationName, id: `${s.id}-${i}-${t}`, medId: s.medicationId });
    }
    grid.forEach(g => g.entries.sort((a, b) => a.time.localeCompare(b.time)));
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="eyebrow">the week ahead</div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="display text-[36px] leading-none tracking-tight mt-1">Schedule</h1>
          <Link href="/schedule/month" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] capsule">
            <GridFour size={13} /> Month view
          </Link>
        </div>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">The next seven days, in one view.</p>
      </header>

      {schedules === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : (schedules.length === 0) ? (
        <Empty
          icon={<Calendar size={32} />}
          title="A blank calendar"
          description="Add a medication and set its dosing times. The week fills itself in."
          action={<Link href="/medications/new"><Btn variant="primary" size="sm">Add medication</Btn></Link>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {grid.map((g, i) => (
              <Surface key={i} className="p-3 min-h-32 flex flex-col">
                <div className="text-xs uppercase tracking-wide text-neutral-500">{DAY_NAMES[g.date.getDay()]}</div>
                <div className="text-lg font-semibold tabular-nums">{g.date.getDate()}</div>
                <div className="mt-2 space-y-1.5 flex-1">
                  {g.entries.length === 0 ? (
                    <div className="text-xs text-neutral-400 dark:text-neutral-600">No doses</div>
                  ) : (
                    g.entries.map(e => (
                      <Link
                        key={e.id}
                        href={`/medications/${e.medId}`}
                        className="flex items-center gap-1.5 text-xs px-1.5 py-1 rounded bg-brand-500/8 hover:bg-brand-500/15 text-brand-700 dark:text-brand-300 transition-colors"
                      >
                        <span className="tabular-nums font-medium">{e.time}</span>
                        <span className="truncate">{e.name}</span>
                      </Link>
                    ))
                  )}
                </div>
              </Surface>
            ))}
          </div>

          <Section title="Active schedules">
            <Surface>
              <ul>
                {schedules.map(s => (
                  <li key={s.id} className="p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                      <PillIcon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/medications/${s.medicationId}`} className="text-sm font-medium hover:underline">{s.medicationName}</Link>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{s.times.join(', ')} {s.daysOfWeek && s.daysOfWeek.length === 7 ? '· daily' : s.daysOfWeek ? `· ${s.daysOfWeek.map(d => DAY_NAMES[d]).join(', ')}` : ''}</div>
                    </div>
                    {s.endDate && <Pill tone="info">ends {formatDate(s.endDate)}</Pill>}
                  </li>
                ))}
              </ul>
            </Surface>
          </Section>
        </>
      )}
    </div>
  );
}
