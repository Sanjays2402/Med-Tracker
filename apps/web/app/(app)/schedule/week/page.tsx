'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow } from '../../../../components/uikit';
import { listSchedules } from '../../../../lib/data';
import type { ScheduleEntry } from '../../../../lib/types';
import { startOfWeek, buildWeekModel } from '../../../../lib/week-days';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleWeekPage() {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(Date.now()));
  const [now] = React.useState(() => Date.now());
  const todayColRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setSchedules(await listSchedules()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedule.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const weekModel = buildWeekModel(weekStart, now);
  const days = weekModel.cells.map((c) => c.date);

  // Bring the current weekday column into view on mount / week change (only
  // when this week actually contains today). Reduced-motion aware.
  React.useEffect(() => {
    if (!weekModel.containsToday || !todayColRef.current) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    todayColRef.current.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [weekModel.containsToday, weekStart, schedules]);

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
          <button onClick={() => setWeekStart(startOfWeek(Date.now()))}
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
            const isToday = weekModel.cells[i]?.isToday ?? false;
            return (
              <div
                key={i}
                ref={isToday ? todayColRef : undefined}
                className="sheet overflow-hidden relative"
                style={
                  isToday
                    ? {
                        borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))',
                        boxShadow: '0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)',
                      }
                    : undefined
                }
              >
                {/* Sage spine on the current weekday column. */}
                {isToday && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px]"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
                <div className={`px-3 py-2 border-b text-xs flex items-center justify-between gap-2 ${
                  isToday ? 'font-medium' : 'text-[var(--ink-muted)]'
                }`}
                  style={{
                    borderColor: 'var(--line-soft)',
                    background: isToday ? 'var(--accent-soft)' : undefined,
                    color: isToday ? 'var(--accent-ink)' : undefined,
                  }}
                >
                  <div>
                    <div className="uppercase tracking-wide">{DAY_NAMES[d.getDay()]}</div>
                    <div className={`text-sm font-semibold mt-0.5 ${isToday ? '' : 'text-[var(--ink)]'}`}>{d.getDate()}</div>
                  </div>
                  {isToday && (
                    <span className="capsule capsule-accent text-[10px] h-5">Today</span>
                  )}
                </div>
                {cells.length === 0 ? (
                  <div className="p-3 text-xs text-[var(--ink-muted)]">No doses</div>
                ) : (
                  <ul>
                    {cells.map((c, ci) => (
                      <li key={ci} className="border-b border-[var(--line-soft)] last:border-0">
                        <Link href={`/medications/${c.medId}`} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-sunk)] transition-colors">
                          <span className="text-xs font-mono text-[var(--ink-muted)] w-12 shrink-0 tabular">{c.time}</span>
                          <span className="text-xs truncate text-[var(--ink)]">{c.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
