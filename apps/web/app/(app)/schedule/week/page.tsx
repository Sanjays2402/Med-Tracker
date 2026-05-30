'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow } from '../../../../components/uikit';
import { listSchedules } from '../../../../lib/data';
import type { ScheduleEntry } from '../../../../lib/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export default function ScheduleWeekPage() {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));

  const load = React.useCallback(async () => {
    setError(null);
    try { setSchedules(await listSchedules()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedule.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  function cellsFor(d: Date): { time: string; name: string; medId: string; sid: string }[] {
    if (!schedules) return [];
    const dow = d.getDay();
    const out: { time: string; name: string; medId: string; sid: string }[] = [];
    for (const s of schedules) {
      if (s.daysOfWeek && !s.daysOfWeek.includes(dow)) continue;
      if (s.endDate && +d > +new Date(s.endDate)) continue;
      if (s.startDate && +d < +new Date(s.startDate)) continue;
      for (const t of s.times) {
        out.push({ time: t, name: s.medicationName, medId: s.medicationId, sid: s.id });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }

  if (error && !schedules) return <ErrorBox message={error} onRetry={load} />;

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-6">
      <Link href="/schedule" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Schedule
      </Link>

      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Week of {weekLabel}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Daily breakdown of all scheduled doses.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart(d => new Date(d.getTime() - 7 * 86400000))}
            className="px-2.5 h-8 rounded-md text-sm border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Previous
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="px-2.5 h-8 rounded-md text-sm border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Today
          </button>
          <button onClick={() => setWeekStart(d => new Date(d.getTime() + 7 * 86400000))}
            className="px-2.5 h-8 rounded-md text-sm border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Next
          </button>
        </div>
      </header>

      {schedules === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : schedules.length === 0 ? (
        <Empty
          icon={<Clock size={32} weight="duotone" />}
          title="No schedules yet"
          description="Add a medication to start scheduling doses."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {days.map((d, i) => {
            const cells = cellsFor(d);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <Surface key={i} className="">
                <div className={`px-3 py-2 border-b border-neutral-100 dark:border-neutral-900 text-xs ${
                  isToday ? 'bg-brand-500/5 text-brand-700 dark:text-brand-300 font-medium' : 'text-neutral-500 dark:text-neutral-400'
                }`}>
                  <div className="uppercase tracking-wide">{DAY_NAMES[d.getDay()]}</div>
                  <div className="text-sm text-neutral-900 dark:text-neutral-100 font-semibold mt-0.5">{d.getDate()}</div>
                </div>
                {cells.length === 0 ? (
                  <div className="p-3 text-xs text-neutral-400">No doses</div>
                ) : (
                  <ul>
                    {cells.map((c, ci) => (
                      <li key={ci} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                        <Link href={`/medications/${c.medId}`} className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                          <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 w-12 shrink-0">{c.time}</span>
                          <span className="text-xs truncate">{c.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
