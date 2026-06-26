'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Pill as PillIcon, Sun, CloudMoon, Moon } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill } from '../../../components/uikit';
import { listSchedules, listTodayDoses, logDose } from '../../../lib/data';
import type { ScheduleEntry, DoseEvent } from '../../../lib/types';
import type { DayScheduleLike } from '../../../lib/day-doses';
import {
  projectUpcoming,
  formatUntil,
  type UpcomingDose,
} from '../../../lib/upcoming-doses';

const PART_ICON: Record<UpcomingDose['partOfDay'], React.ComponentType<{ size?: number }>> = {
  morning: Sun,
  afternoon: CloudMoon,
  evening: Moon,
};

function formatClock(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
}

export default function UpcomingPage() {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[] | null>(null);
  const [todayDoses, setTodayDoses] = React.useState<DoseEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [takenKeys, setTakenKeys] = React.useState<ReadonlySet<string>>(() => new Set());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [s, d] = await Promise.all([listSchedules(), listTodayDoses()]);
      setSchedules(s);
      setTodayDoses(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load upcoming doses.');
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const recurrences: DayScheduleLike[] = (schedules ?? []).map((s) => ({
    medicationId: s.medicationId,
    medicationName: s.medicationName,
    times: s.times,
    ...(s.daysOfWeek ? { daysOfWeek: s.daysOfWeek } : {}),
    ...(s.endDate ? { endDate: s.endDate } : {}),
    ...(s.startDate ? { startDate: s.startDate } : {}),
    ...(s.notes ? { notes: s.notes } : {}),
  }));

  const summary = projectUpcoming(recurrences, now, 7);

  // A stable per-dose key (day + med + time) so a quick-take collapses just that row.
  const keyFor = (d: UpcomingDose) => `${d.dayKey}|${d.medicationId}|${d.time}`;

  const summaryTodayKey = summary.groups.find((g) => g.daysAhead === 0)?.key ?? '';

  // Match a projected today-dose back to a real DoseEvent so Take can log it.
  function todayDoseId(d: UpcomingDose): string | null {
    if (d.dayKey !== summaryTodayKey) return null;
    const hit = todayDoses.find(
      (e) =>
        e.medicationId === d.medicationId &&
        e.status === 'pending' &&
        new Date(e.scheduledAt).getHours() * 60 + new Date(e.scheduledAt).getMinutes() === d.minutes,
    );
    return hit?.id ?? null;
  }

  async function take(d: UpcomingDose) {
    const id = todayDoseId(d);
    if (!id) return;
    const k = keyFor(d);
    try {
      await logDose(id, 'taken');
      setTakenKeys((prev) => new Set(prev).add(k));
      setTodayDoses((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'taken' } : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log that dose.');
    }
  }

  if (error && !schedules) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header>
        <div className="eyebrow">still to come</div>
        <h1 className="display text-[36px] leading-none tracking-tight mt-1">Upcoming</h1>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">
          {schedules === null
            ? 'Lining up your week…'
            : summary.total === 0
            ? 'Nothing scheduled in the next 7 days.'
            : `${summary.total} dose${summary.total === 1 ? '' : 's'} across the next 7 days${
                summary.next ? ` · next ${formatUntil(summary.next.minutesUntil)}` : ''
              }.`}
        </p>
      </header>

      {schedules === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : summary.total === 0 ? (
        <Empty
          icon={<Bell size={28} />}
          title="Pillbox is quiet"
          description="No doses are scheduled in the week ahead. Add a medication and we'll line them up."
          action={<Link href="/medications/new"><Btn size="sm" variant="primary">Add a medication</Btn></Link>}
        />
      ) : (
        <div className="space-y-5">
          {summary.groups.map((group) => (
            <section key={group.key} className="space-y-2">
              {/* Sticky relative-day header */}
              <div
                className="sticky top-2 z-10 flex items-center justify-between gap-3 px-3 py-1.5 rounded-full backdrop-blur"
                style={{ background: 'color-mix(in srgb, var(--bg-elev) 86%, transparent)', border: '1px solid var(--line-soft)' }}
              >
                <span className="text-[13px] font-semibold tracking-tight">{group.label}</span>
                <span className="text-[11.5px] tabular text-[var(--ink-muted)]">
                  {group.doses.length} dose{group.doses.length === 1 ? '' : 's'}
                </span>
              </div>

              <Surface>
                <ul>
                  {group.doses.map((d) => {
                    const k = keyFor(d);
                    const isTaken = takenKeys.has(k);
                    const canTake = group.daysAhead === 0 && !isTaken && todayDoseId(d) !== null;
                    const Icon = PART_ICON[d.partOfDay];
                    return (
                      <li
                        key={k}
                        className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line-soft)] last:border-0"
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                          aria-hidden
                        >
                          <PillIcon size={17} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/medications/${d.medicationId}`}
                            className="text-[14px] font-medium hover:underline underline-offset-4"
                          >
                            {d.medicationName}
                          </Link>
                          <div className="text-[12px] text-[var(--ink-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="capsule">
                              <Icon size={11} /> <span className="tabular">{formatClock(d.time)}</span>
                            </span>
                            {group.daysAhead === 0 && (
                              <span className="text-[var(--ink-soft)]">{formatUntil(d.minutesUntil)}</span>
                            )}
                            {d.notes && <span className="truncate">{d.notes}</span>}
                          </div>
                        </div>
                        {isTaken ? (
                          <Pill tone="ok">taken</Pill>
                        ) : canTake ? (
                          <Btn size="sm" variant="primary" onClick={() => take(d)}>Take</Btn>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            </section>
          ))}
        </div>
      )}

      {error && schedules && <ErrorBox message={error} onRetry={() => setError(null)} />}
    </div>
  );
}
