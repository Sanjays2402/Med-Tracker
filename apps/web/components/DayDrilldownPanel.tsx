'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, Pill as PillIcon, Sun, CloudMoon, Moon } from '@med/icons';
import { Pill } from './uikit';
import {
  dosesForDay,
  groupByPartOfDay,
  PART_OF_DAY_LABEL,
  type DayScheduleLike,
  type DayDose,
} from '../lib/day-doses';

/**
 * DayDrilldownPanel — a slide-in side panel listing one day's doses by time.
 *
 * Driven entirely by the pure dosesForDay/groupByPartOfDay expansion in
 * lib/day-doses.ts. Opens when `dayKey` is set, closes on backdrop click / Esc
 * / the close button. Doses are grouped into Morning / Afternoon / Evening,
 * each row a time + medication chip linking to that medication.
 */

const PART_ICON: Record<DayDose['partOfDay'], React.ComponentType<{ size?: number }>> = {
  morning: Sun,
  afternoon: CloudMoon,
  evening: Moon,
};

function formatDayHeading(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey);
  if (!m) return dayKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTimeLabel(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const min = m[2];
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${period}`;
}

export function DayDrilldownPanel({
  dayKey,
  recurrences,
  onClose,
}: {
  dayKey: string | null;
  recurrences: readonly DayScheduleLike[];
  onClose: () => void;
}) {
  // Close on Escape.
  React.useEffect(() => {
    if (!dayKey) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dayKey, onClose]);

  if (!dayKey) return null;

  const summary = dosesForDay(dayKey, recurrences);
  const groups = groupByPartOfDay(summary.doses);

  return (
    <div className="fixed inset-0 z-[900] flex justify-end" role="dialog" aria-modal="true" aria-label={`Doses on ${formatDayHeading(dayKey)}`}>
      {/* Backdrop */}
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: 'color-mix(in srgb, var(--ink) 24%, transparent)', backdropFilter: 'blur(4px)' }}
      />
      {/* Panel */}
      <div
        className="relative h-full w-full max-w-sm overflow-y-auto anim-in-right"
        style={{ background: 'var(--bg-elev)', borderLeft: '1px solid var(--line)', boxShadow: '-24px 0 48px -24px rgba(0,0,0,0.3)' }}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--line-soft)', background: 'var(--bg-elev)' }}>
          <div className="min-w-0">
            <div className="eyebrow">day detail</div>
            <h2 className="display text-[20px] leading-tight mt-0.5 truncate">{formatDayHeading(dayKey)}</h2>
            <p className="text-[12.5px] text-[var(--ink-muted)] mt-1">
              {summary.total === 0
                ? 'No doses scheduled'
                : `${summary.total} dose${summary.total === 1 ? '' : 's'} · ${summary.medicationCount} medication${summary.medicationCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close day detail"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] shrink-0"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 py-4 space-y-5">
          {summary.total === 0 ? (
            <div className="text-center py-10 text-[13px] text-[var(--ink-muted)]">
              A rest day. Nothing is scheduled.
            </div>
          ) : (
            groups.map((group) => {
              const Icon = PART_ICON[group.part];
              return (
                <section key={group.part} className="space-y-2">
                  <div className="flex items-center gap-2 eyebrow">
                    <Icon size={13} />
                    {PART_OF_DAY_LABEL[group.part]}
                    <span className="text-[var(--ink-muted)] normal-case tracking-normal">· {group.doses.length}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {group.doses.map((d, i) => (
                      <li key={`${d.medicationId}-${d.time}-${i}`}>
                        <Link
                          href={`/medications/${d.medicationId}`}
                          className="flex items-center gap-3 p-2.5 rounded-[var(--radius-capsule)] hover:bg-[var(--bg-sunk)] transition-colors"
                          style={{ border: '1px solid var(--line-soft)' }}
                        >
                          <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
                            <PillIcon size={15} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] font-medium truncate">{d.medicationName}</span>
                            {d.notes && <span className="block text-[11.5px] text-[var(--ink-muted)] truncate">{d.notes}</span>}
                          </span>
                          <Pill tone="info">{formatTimeLabel(d.time)}</Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
