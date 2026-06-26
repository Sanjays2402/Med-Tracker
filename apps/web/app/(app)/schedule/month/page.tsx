'use client';

import * as React from 'react';
import Link from 'next/link';
import { Calendar, CaretLeft, CaretRight, List } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Btn } from '../../../../components/uikit';
import { listSchedules } from '../../../../lib/data';
import type { ScheduleEntry } from '../../../../lib/types';
import {
  buildMonthGrid,
  doseCountsForGrid,
  prevMonth,
  nextMonth,
  WEEKDAY_LABELS,
  type RecurrenceLike,
} from '../../../../lib/month-grid';
import { DayDrilldownPanel } from '../../../../components/DayDrilldownPanel';
import type { DayScheduleLike } from '../../../../lib/day-doses';
import { densityDots, LOAD_TONE_VAR } from '../../../../lib/month-density';

export default function ScheduleMonthPage() {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

  const today = React.useMemo(() => new Date(), []);
  const [view, setView] = React.useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));

  const load = React.useCallback(async () => {
    setError(null);
    try { setSchedules(await listSchedules()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load schedule.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !schedules) return <ErrorBox message={error} onRetry={load} />;

  const grid = buildMonthGrid(view.year, view.month, today);
  const recurrences: RecurrenceLike[] = (schedules ?? []).map((s) => ({
    times: s.times,
    ...(s.daysOfWeek ? { daysOfWeek: s.daysOfWeek } : {}),
    ...(s.endDate ? { endDate: s.endDate } : {}),
    ...(s.startDate ? { startDate: s.startDate } : {}),
  }));
  const counts = doseCountsForGrid(grid, recurrences);

  // Named recurrences for the day-drilldown panel (carry medication names + notes).
  const namedRecurrences: DayScheduleLike[] = (schedules ?? []).map((s) => ({
    medicationId: s.medicationId,
    medicationName: s.medicationName,
    times: s.times,
    ...(s.daysOfWeek ? { daysOfWeek: s.daysOfWeek } : {}),
    ...(s.endDate ? { endDate: s.endDate } : {}),
    ...(s.startDate ? { startDate: s.startDate } : {}),
    ...(s.notes ? { notes: s.notes } : {}),
  }));

  // Per-day medication names (for the chips), built the same way as the counts.
  const namesByDay: Record<string, string[]> = {};
  for (const cell of grid.cells) {
    const names: string[] = [];
    for (const s of schedules ?? []) {
      const active =
        (!s.daysOfWeek || s.daysOfWeek.length === 0 || s.daysOfWeek.includes(cell.weekday)) &&
        inRange(cell.key, s.startDate, s.endDate);
      if (active) names.push(s.medicationName);
    }
    if (names.length) namesByDay[cell.key] = names;
  }

  const monthTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const isCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">month at a glance</div>
          <h1 className="display text-[36px] leading-none tracking-tight mt-1">{grid.label}</h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2">
            {schedules === null ? 'Loading your doses…' : `${monthTotal} dose${monthTotal === 1 ? '' : 's'} scheduled this month.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/schedule" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)] capsule">
            <List size={13} /> Week view
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView((v) => prevMonth(v.year, v.month))}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
              style={{ border: '1px solid var(--line)' }}
              aria-label="Previous month"
            >
              <CaretLeft size={15} />
            </button>
            {!isCurrentMonth && (
              <Btn size="sm" variant="secondary" onClick={() => setView({ year: today.getFullYear(), month: today.getMonth() })}>
                Today
              </Btn>
            )}
            <button
              type="button"
              onClick={() => setView((v) => nextMonth(v.year, v.month))}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
              style={{ border: '1px solid var(--line)' }}
              aria-label="Next month"
            >
              <CaretRight size={15} />
            </button>
          </div>
        </div>
      </header>

      {schedules === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : schedules.length === 0 ? (
        <Empty
          icon={<Calendar size={32} />}
          title="A blank month"
          description="Add a medication and set its dosing times. The calendar fills itself in."
          action={<Link href="/medications/new"><Btn variant="primary" size="sm">Add medication</Btn></Link>}
        />
      ) : (
        <Surface className="p-3 sm:p-4">
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="eyebrow text-center py-1">{d}</div>
            ))}
          </div>

          {/* 6 x 7 grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {grid.cells.map((cell) => {
              const names = namesByDay[cell.key] ?? [];
              const count = counts[cell.key] ?? 0;
              const clickable = count > 0;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={clickable ? () => setSelectedDay(cell.key) : undefined}
                  aria-label={
                    clickable
                      ? `${cell.day}, ${count} dose${count === 1 ? '' : 's'} - open day detail`
                      : `${cell.day}, no doses`
                  }
                  disabled={!clickable}
                  className={`min-h-[78px] sm:min-h-[96px] rounded-[var(--radius-capsule)] p-1.5 flex flex-col text-left transition-colors ${
                    clickable ? 'hover:border-[var(--accent)] cursor-pointer' : 'cursor-default'
                  } ${selectedDay === cell.key ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-elev)]' : ''}`}
                  style={{
                    background: cell.inMonth ? 'var(--bg)' : 'transparent',
                    border: `1px solid ${cell.isToday ? 'var(--accent)' : 'var(--line-soft)'}`,
                    opacity: cell.inMonth ? 1 : 0.45,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] tabular ${
                        cell.isToday ? 'font-semibold' : ''
                      }`}
                      style={
                        cell.isToday
                          ? { background: 'var(--accent)', color: 'var(--bg-elev)' }
                          : { color: cell.inMonth ? 'var(--ink-soft)' : 'var(--ink-muted)' }
                      }
                    >
                      {cell.day}
                    </span>
                    {count > 0 && (
                      <span className="text-[10.5px] tabular text-[var(--ink-muted)]">{count}</span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1 flex-1 overflow-hidden">
                    {names.slice(0, 3).map((name, i) => (
                      <div
                        key={`${cell.key}-${i}`}
                        className="text-[10.5px] leading-tight px-1.5 py-0.5 rounded-full truncate"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                        title={name}
                      >
                        {name}
                      </div>
                    ))}
                  </div>

                  {count > 0 && (() => {
                    // Dose-density dots: one dot per scheduled dose (up to a cap),
                    // tone-ramped by the day's load, with a trailing "+N" overflow.
                    // Reads "how busy is this day" at a glance without a number.
                    const d = densityDots(count);
                    return (
                      <div
                        className="mt-1 flex items-center gap-[3px] pl-1.5"
                        title={`${count} dose${count === 1 ? '' : 's'} scheduled`}
                      >
                        {Array.from({ length: d.dots }).map((_, i) => (
                          <span
                            key={i}
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: LOAD_TONE_VAR[d.load] }}
                            aria-hidden
                          />
                        ))}
                        {d.overflow && (
                          <span
                            className="text-[9.5px] tabular leading-none"
                            style={{ color: LOAD_TONE_VAR[d.load] }}
                            aria-hidden
                          >
                            +{d.overflowCount}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[11.5px] text-[var(--ink-muted)] px-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
              Today
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: 'var(--accent-soft)' }} />
              Scheduled dose
            </span>
            <span className="ml-auto">Tap any day with doses to see the full schedule.</span>
          </div>
        </Surface>
      )}

      {error && schedules && <ErrorBox message={error} onRetry={load} />}

      <DayDrilldownPanel
        dayKey={selectedDay}
        recurrences={namedRecurrences}
        onClose={() => setSelectedDay(null)}
        onStep={(next) => setSelectedDay(next)}
      />
    </div>
  );
}

function inRange(dayKey: string, startISO?: string, endISO?: string): boolean {
  if (startISO && dayKey < startISO.slice(0, 10)) return false;
  if (endISO && dayKey > endISO.slice(0, 10)) return false;
  return true;
}
