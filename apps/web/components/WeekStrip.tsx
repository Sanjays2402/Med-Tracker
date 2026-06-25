'use client';

import * as React from 'react';
import { buildWeekStrip, summarizeWeekStrip, type WeekStripDay, type WeekStripDoseInput, type DayState } from '../lib/week-strip';

/**
 * WeekStrip — a row of seven "pills", one per day of the last week, tinted to
 * that day's adherence state for a single medication. Full = sage, partial =
 * amber, missed = coral, none = muted track. Renders a tiny summary line under
 * the strip. Pure presentation over lib/week-strip's model.
 */

const STATE_STYLE: Record<DayState, { bg: string; fg: string; label: string }> = {
  full: { bg: 'var(--ok-bg)', fg: 'var(--ok)', label: 'all taken' },
  partial: { bg: 'var(--warn-bg)', fg: 'var(--warn)', label: 'some taken' },
  missed: { bg: 'var(--danger-bg)', fg: 'var(--danger)', label: 'none taken' },
  none: { bg: 'var(--bg-sunk)', fg: 'var(--ink-muted)', label: 'nothing scheduled' },
};

export function WeekStrip({
  dosesByDay,
  today,
}: {
  dosesByDay: Record<string, WeekStripDoseInput[]>;
  today?: number;
}) {
  const [now] = React.useState(() => today ?? Date.now());
  const strip = React.useMemo(() => buildWeekStrip(dosesByDay, now), [dosesByDay, now]);
  const summary = React.useMemo(() => summarizeWeekStrip(strip), [strip]);

  return (
    <div className="sheet p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">last 7 days</div>
        <div className="text-[12px] text-[var(--ink-muted)] tabular">
          {summary.activeDays > 0 ? `${summary.adherencePct}% on schedule` : 'no doses scheduled'}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {strip.map((d) => (
          <DayPill key={d.key} day={d} />
        ))}
      </div>

      {summary.activeDays > 0 && (
        <div className="mt-4 flex items-center gap-3 flex-wrap text-[11px] text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--ok)' }} /> {summary.perfectDays} perfect
          </span>
          {summary.missedDays > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--danger)' }} /> {summary.missedDays} missed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DayPill({ day }: { day: WeekStripDay }) {
  const style = STATE_STYLE[day.state];
  const title = day.scheduled > 0
    ? `${day.key}: ${day.taken}/${day.scheduled} taken (${style.label})`
    : `${day.key}: ${style.label}`;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[10px] text-[var(--ink-muted)]">{day.weekdayInitial}</div>
      <div
        className="w-full aspect-[3/4] rounded-full flex items-center justify-center relative"
        style={{
          background: style.bg,
          outline: day.isToday ? '1.5px solid var(--accent)' : undefined,
          outlineOffset: day.isToday ? '1.5px' : undefined,
        }}
        title={title}
      >
        {/* center capsule glyph tinted to state */}
        <span
          className="w-1.5 h-5 rounded-full"
          style={{ background: style.fg, opacity: day.state === 'none' ? 0.3 : 1 }}
          aria-hidden
        />
      </div>
      <div className="text-[10px] tabular text-[var(--ink-muted)]">{day.day}</div>
    </div>
  );
}
