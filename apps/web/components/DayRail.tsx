'use client';

import * as React from 'react';
import Link from 'next/link';
import type { DoseEvent } from '../lib/types';
import { formatTime } from './uikit';

/**
 * DayRail — horizontal "today's pillbox" timeline.
 * Each dose is a capsule placed at its scheduled hour (6:00–24:00).
 * Color encodes state: sage taken, amber upcoming, coral overdue.
 */

const START_HOUR = 6;
const END_HOUR = 24; // exclusive
const HOURS = END_HOUR - START_HOUR;

type Status = DoseEvent['status'];

function classify(d: DoseEvent, now: number): 'taken' | 'skipped' | 'overdue' | 'upcoming' | 'next' {
  if (d.status === 'taken') return 'taken';
  if (d.status === 'skipped') return 'skipped';
  if (d.status === 'missed') return 'overdue';
  const t = +new Date(d.scheduledAt);
  if (t < now - 15 * 60_000) return 'overdue';
  return 'upcoming';
}

function hourOffset(iso: string): number {
  const d = new Date(iso);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < START_HOUR) return 0;
  if (h > END_HOUR) return HOURS;
  return h - START_HOUR;
}

export function DayRail({
  doses,
  onTake,
}: {
  doses: DoseEvent[];
  onTake?: (id: string) => void;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Find next pending dose
  const pending = [...doses]
    .filter((d) => d.status === 'pending')
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const upcomingNext = pending.find((d) => +new Date(d.scheduledAt) >= now - 15 * 60_000);
  const nextId = upcomingNext?.id;

  const nowOffset =
    new Date(now).getHours() + new Date(now).getMinutes() / 60 - START_HOUR;
  const showNowMark = nowOffset >= 0 && nowOffset <= HOURS;

  const ticks = [6, 9, 12, 15, 18, 21, 24];

  return (
    <div className="sheet p-5 sm:p-6 anim-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Today's pillbox</div>
          <div className="display text-[26px] sm:text-[30px] leading-none tracking-tight mt-1">
            {pending.length === 0 ? "You're all squared away" : nextHeadline(upcomingNext, now)}
          </div>
        </div>
        {upcomingNext && (
          <CountdownChip iso={upcomingNext.scheduledAt} now={now} />
        )}
      </div>

      {/* Rail */}
      <div className="mt-7 relative">
        <div
          className="relative h-16 rounded-full"
          style={{ background: 'var(--bg-sunk)', border: '1px solid var(--line-soft)' }}
        >
          {/* hour grid */}
          {ticks.map((h) => {
            const pct = ((h - START_HOUR) / HOURS) * 100;
            return (
              <div
                key={h}
                className="absolute top-0 bottom-0 w-px"
                style={{ left: `${pct}%`, background: 'var(--line)', opacity: 0.6 }}
                aria-hidden
              />
            );
          })}

          {/* now indicator */}
          {showNowMark && (
            <div
              className="absolute top-[-6px] bottom-[-6px] flex flex-col items-center"
              style={{ left: `calc(${(nowOffset / HOURS) * 100}% - 1px)` }}
              aria-label="Now"
            >
              <div
                className="w-px flex-1"
                style={{ background: 'var(--accent)' }}
              />
              <div
                className="w-2 h-2 rounded-full -mt-1"
                style={{ background: 'var(--accent)' }}
              />
            </div>
          )}

          {/* dose capsules */}
          {doses.map((d) => {
            const offset = hourOffset(d.scheduledAt);
            const pct = (offset / HOURS) * 100;
            const cls = classify(d, now);
            const isNext = d.id === nextId;
            return (
              <DoseCapsule
                key={d.id}
                dose={d}
                leftPct={pct}
                status={cls}
                isNext={isNext}
                onTake={onTake}
              />
            );
          })}
        </div>

        {/* hour labels */}
        <div className="mt-2 relative h-4 text-[10.5px] text-[var(--ink-muted)] tabular">
          {ticks.map((h) => {
            const pct = ((h - START_HOUR) / HOURS) * 100;
            const label =
              h === 24 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`;
            return (
              <span
                key={h}
                className="absolute -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-[11.5px] text-[var(--ink-muted)]">
        <LegendDot color="var(--accent)" label="Taken" />
        <LegendDot color="var(--warn)" label="Upcoming" />
        <LegendDot color="var(--danger)" label="Overdue" />
        <LegendDot color="var(--ink-muted)" label="Skipped" />
        <span className="ml-auto">
          <Link href="/today" className="hover:text-[var(--ink)]">Open full schedule →</Link>
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function DoseCapsule({
  dose,
  leftPct,
  status,
  isNext,
  onTake,
}: {
  dose: DoseEvent;
  leftPct: number;
  status: 'taken' | 'skipped' | 'overdue' | 'upcoming' | 'next';
  isNext: boolean;
  onTake?: (id: string) => void;
}) {
  const colors = {
    taken:    { bg: 'var(--ok-bg)',     fg: 'var(--ok)',     ring: 'var(--ok)' },
    skipped:  { bg: 'var(--bg-sunk)',   fg: 'var(--ink-muted)', ring: 'var(--line)' },
    overdue:  { bg: 'var(--danger-bg)', fg: 'var(--danger)', ring: 'var(--danger)' },
    upcoming: { bg: 'var(--warn-bg)',   fg: 'var(--warn)',   ring: 'var(--warn)' },
    next:     { bg: 'var(--warn-bg)',   fg: 'var(--warn)',   ring: 'var(--warn)' },
  }[status];

  const label = `${dose.medicationName}${dose.strength ? ' ' + dose.strength : ''} at ${formatTime(dose.scheduledAt)}`;

  return (
    <button
      title={label}
      aria-label={label}
      onClick={() => onTake?.(dose.id)}
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-9 min-w-9 px-3 rounded-full text-[11.5px] font-medium tabular flex items-center gap-1.5 ${
        status === 'overdue' ? 'anim-overdue' : ''
      } ${isNext ? 'ring-2 ring-offset-2' : ''}`}
      style={{
        left: `${leftPct}%`,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.ring}`,
        // @ts-expect-error css var for ring offset
        '--tw-ring-color': colors.ring,
        // @ts-expect-error css var for ring offset
        '--tw-ring-offset-color': 'var(--bg-elev)',
      }}
    >
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: colors.fg }}
      />
      {formatTime(dose.scheduledAt)}
    </button>
  );
}

function CountdownChip({ iso, now }: { iso: string; now: number }) {
  const diff = +new Date(iso) - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  const overdue = diff < -15 * 60_000;

  let label: string;
  if (overdue) {
    label = mins < 60 ? `${mins}m late` : `${hrs}h ${rem}m late`;
  } else if (mins < 1) {
    label = 'now';
  } else if (mins < 60) {
    label = `in ${mins}m`;
  } else {
    label = `in ${hrs}h ${rem}m`;
  }

  return (
    <div
      className={`flex flex-col items-end ${overdue ? 'anim-overdue rounded-full' : ''}`}
    >
      <div className="eyebrow">next dose</div>
      <div
        className="display text-[28px] sm:text-[32px] leading-none tabular mt-1"
        style={{ color: overdue ? 'var(--danger)' : 'var(--ink)' }}
      >
        {label}
      </div>
    </div>
  );
}

function nextHeadline(d: DoseEvent | undefined, now: number): string {
  if (!d) return 'No doses remaining';
  const diff = +new Date(d.scheduledAt) - now;
  const late = diff < -15 * 60_000;
  const name = d.medicationName + (d.strength ? ' ' + d.strength : '');
  return late ? `${name} is overdue` : `${name} up next`;
}
