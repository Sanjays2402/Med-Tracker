'use client';

import * as React from 'react';
import Link from 'next/link';
import { X, Pill as PillIcon, Sun, CloudMoon, Moon, CaretLeft, CaretRight } from '@med/icons';
import { Pill } from './uikit';
import {
  dosesForDay,
  groupByPartOfDay,
  PART_OF_DAY_LABEL,
  type DayScheduleLike,
  type DayDose,
} from '../lib/day-doses';
import { dayStepView, relativeDayLabel } from '../lib/day-step';
import { nextDayWithDoses, jumpLabel } from '../lib/day-jump';

/**
 * DayDrilldownPanel — a slide-in side panel listing one day's doses by time.
 *
 * Driven entirely by the pure dosesForDay/groupByPartOfDay expansion in
 * lib/day-doses.ts. Opens when `dayKey` is set, closes on backdrop click / Esc
 * / the close button. Doses are grouped into Morning / Afternoon / Evening,
 * each row a time + medication chip linking to that medication.
 *
 * When `onStep` is provided the header grows prev/next day arrows and the panel
 * binds Left/Right arrow keys, so a user can walk days without closing it. The
 * neighbour keys + a relative "Today / Tomorrow / Yesterday" subhead come from
 * the pure lib/day-step model.
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
  onStep,
  today,
}: {
  dayKey: string | null;
  recurrences: readonly DayScheduleLike[];
  onClose: () => void;
  /** When provided, the panel can walk to an adjacent day (arrows + keys). */
  onStep?: (nextDayKey: string) => void;
  /** Local YYYY-MM-DD "today" for the relative subhead; defaults to now. */
  today?: string;
}) {
  const step = dayKey ? dayStepView(dayKey, today) : null;

  // Close on Escape; Left/Right walk days when stepping is enabled.
  React.useEffect(() => {
    if (!dayKey) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!onStep || !step) return;
      // Don't hijack arrows while focus is in a field.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onStep(step.prevKey);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onStep(step.nextKey);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dayKey, onClose, onStep, step]);

  if (!dayKey) return null;

  const summary = dosesForDay(dayKey, recurrences);
  const groups = groupByPartOfDay(summary.doses);

  // When the day is empty and stepping is enabled, offer a jump to the next day
  // that actually has doses (scan forward up to the default 14-day horizon).
  const jump =
    onStep && summary.total === 0 ? nextDayWithDoses(dayKey, recurrences) : null;
  const jumpText =
    jump && jump.dayKey
      ? jumpLabel(jump, (k) => relativeDayLabel(k, today ?? dayKey))
      : null;

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
            <div className="flex items-center gap-2 eyebrow">
              <span>day detail</span>
              {step && (
                <span
                  className="normal-case tracking-normal text-[10.5px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: step.isToday ? 'var(--accent-soft)' : 'var(--bg-sunk)',
                    color: step.isToday ? 'var(--accent-ink)' : 'var(--ink-muted)',
                  }}
                >
                  {step.relativeLabel}
                </span>
              )}
            </div>
            <h2 className="display text-[20px] leading-tight mt-0.5 truncate">{formatDayHeading(dayKey)}</h2>
            <p className="text-[12.5px] text-[var(--ink-muted)] mt-1">
              {summary.total === 0
                ? 'No doses scheduled'
                : `${summary.total} dose${summary.total === 1 ? '' : 's'} · ${summary.medicationCount} medication${summary.medicationCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onStep && step && (
              <div className="flex items-center gap-0.5" role="group" aria-label="Step day">
                <button
                  type="button"
                  onClick={() => onStep(step.prevKey)}
                  aria-label="Previous day"
                  title="Previous day (←)"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
                >
                  <CaretLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onStep(step.nextKey)}
                  aria-label="Next day"
                  title="Next day (→)"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
                >
                  <CaretRight size={15} />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close day detail"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="px-5 py-4 space-y-5">
          {summary.total === 0 ? (
            <div className="text-center py-10 space-y-4">
              <p className="text-[13px] text-[var(--ink-muted)]">A rest day. Nothing is scheduled.</p>
              {jump && jump.dayKey && jumpText && (
                <button
                  type="button"
                  onClick={() => onStep?.(jump.dayKey!)}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12.5px] font-medium transition-colors"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                >
                  <CaretRight size={14} />
                  {jumpText}
                  <span className="tabular text-[11px] opacity-70">
                    · {jump.doseCount} dose{jump.doseCount === 1 ? '' : 's'}
                  </span>
                </button>
              )}
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
