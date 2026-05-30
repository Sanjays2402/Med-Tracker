'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow } from '../../../../components/uikit';
import { listSchedules } from '../../../../lib/data';
import type { ScheduleEntry } from '../../../../lib/types';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}

function buildGrid(monthStart: Date): Date[] {
  const start = new Date(monthStart);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function ScheduleMonthPage() {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [monthStart, setMonthStart] = React.useState(() => startOfMonth(new Date()));

  const load = React.useCallback(async () => {
    setError(null);
    try { setSchedules(await listSchedules()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedule.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const grid = React.useMemo(() => buildGrid(monthStart), [monthStart]);

  function dosesOn(d: Date): number {
    if (!schedules) return 0;
    const dow = d.getDay();
    let count = 0;
    for (const s of schedules) {
      if (s.daysOfWeek && !s.daysOfWeek.includes(dow)) continue;
      if (s.endDate && +d > +new Date(s.endDate)) continue;
      if (s.startDate && +d < +new Date(s.startDate)) continue;
      count += s.times.length;
    }
    return count;
  }

  if (error && !schedules) return <ErrorBox message={error} onRetry={load} />;

  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <Link href="/schedule" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Schedule
      </Link>

      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{monthLabel}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Monthly view of dose density.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonthStart(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="px-2.5 h-8 rounded-md text-sm border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Previous
          </button>
          <button onClick={() => setMonthStart(startOfMonth(new Date()))}
            className="px-2.5 h-8 rounded-md text-sm border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            Today
          </button>
          <button onClick={() => setMonthStart(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
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
          description="Add a medication to populate the calendar."
        />
      ) : (
        <Surface>
          <div className="grid grid-cols-7 text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 border-b border-neutral-100 dark:border-neutral-900">
            {WEEK.map(d => (
              <div key={d} className="p-2 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d, i) => {
              const inMonth = d.getMonth() === monthStart.getMonth();
              const isToday = d.toDateString() === new Date().toDateString();
              const count = dosesOn(d);
              const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              return (
                <Link
                  key={i}
                  href={`/history/${ymd}`}
                  className={`aspect-square border-r border-b border-neutral-100 dark:border-neutral-900 p-1.5 sm:p-2 flex flex-col gap-1 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 ${
                    !inMonth ? 'text-neutral-300 dark:text-neutral-700' : ''
                  } ${isToday ? 'bg-brand-500/5' : ''}`}
                >
                  <span className={`text-xs ${isToday ? 'font-semibold text-brand-700 dark:text-brand-300' : ''}`}>{d.getDate()}</span>
                  {count > 0 && inMonth && (
                    <div className="flex flex-wrap gap-0.5 mt-auto">
                      {Array.from({ length: Math.min(count, 6) }).map((_, di) => (
                        <span key={di} className="w-1.5 h-1.5 rounded-full bg-brand-500/70" />
                      ))}
                      {count > 6 && <span className="text-[10px] text-neutral-500 ml-0.5">+{count - 6}</span>}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </Surface>
      )}
    </div>
  );
}
