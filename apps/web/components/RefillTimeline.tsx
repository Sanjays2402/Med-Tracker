'use client';

import * as React from 'react';
import { buildTimeline, todayLabel, markTitle, legendCounts, legendCountSuffix, type TimelineRefillInput, type TimelineTone } from '../lib/refill-timeline';
import {
  STRIP_DENSITY_STORAGE_KEY,
  DEFAULT_STRIP_DENSITY,
  parseStripDensity,
  serializeStripDensity,
  stripDensityConfig,
  toggleStripDensity,
  otherStripDensityLabel,
  stripDensityAnnouncement,
  trackHeight,
  type StripDensity,
} from '../lib/refill-timeline-density';

/**
 * RefillTimeline — a horizontal strip plotting each refill's refill-by date
 * across the next N days so clustering is visible at a glance. Today is marked
 * with a vertical line; the gutter to its left is the overdue zone. Marks stack
 * into lanes when they fall close together. Pure presentation over
 * lib/refill-timeline's layout model.
 */

const TONE_VARS: Record<TimelineTone, { dot: string; ring: string }> = {
  overdue: { dot: 'var(--danger)', ring: 'var(--danger-bg)' },
  soon: { dot: 'var(--warn)', ring: 'var(--warn-bg)' },
  later: { dot: 'var(--accent)', ring: 'var(--accent-soft)' },
  done: { dot: 'var(--ink-muted)', ring: 'var(--bg-sunk)' },
};

export function RefillTimeline({
  refills,
  windowDays = 30,
}: {
  refills: TimelineRefillInput[];
  windowDays?: number;
}) {
  // Recompute "now" once on mount so the strip is stable across re-renders.
  const [now] = React.useState(() => Date.now());
  const [density, setDensity] = React.useState<StripDensity>(DEFAULT_STRIP_DENSITY);
  // Track whether the user has flipped at least once so the aria-live region is
  // silent on mount (the restored value isn't an announcement) but speaks the new
  // spacing on every press thereafter.
  const [flipped, setFlipped] = React.useState(false);
  const model = React.useMemo(
    () => buildTimeline(refills, now, { windowDays }),
    [refills, now, windowDays],
  );

  // Restore the persisted compact/comfortable choice on mount (parallels the
  // medications density + refills sort prefs).
  React.useEffect(() => {
    try { setDensity(parseStripDensity(window.localStorage.getItem(STRIP_DENSITY_STORAGE_KEY))); }
    catch { /* localStorage unavailable - keep comfortable */ }
  }, []);

  const flipDensity = React.useCallback(() => {
    setDensity((d) => {
      const next = toggleStripDensity(d);
      try { window.localStorage.setItem(STRIP_DENSITY_STORAGE_KEY, serializeStripDensity(next)); }
      catch { /* best-effort persistence */ }
      return next;
    });
    setFlipped(true);
  }, []);

  const laneCount = Math.max(1, ...model.marks.map((m) => m.lane + 1));
  const cfg = stripDensityConfig(density);
  const height = trackHeight(laneCount, density);

  if (model.marks.length === 0) return null;

  return (
    <div className="sheet p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">next {windowDays} days</div>
        <div className="flex items-center gap-2">
          {model.hasOverdue && (
            <span className="capsule capsule-danger text-[11px]">overdue refills</span>
          )}
          <button
            type="button"
            onClick={flipDensity}
            aria-label={`Switch to ${otherStripDensityLabel(density)} spacing`}
            className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
          >
            {otherStripDensityLabel(density)}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {flipped ? stripDensityAnnouncement(density) : ''}
          </span>
        </div>
      </div>

      <div className="relative" style={{ height }}>
        {/* Overdue zone shading (left of today) */}
        {model.todayPosition > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-l-[10px]"
            style={{
              width: `${model.todayPosition * 100}%`,
              background: 'color-mix(in srgb, var(--danger) 7%, transparent)',
            }}
            aria-hidden
          />
        )}

        {/* Gridline ticks */}
        {model.ticks.map((t) => (
          <div
            key={t.dayOffset}
            className="absolute inset-y-0"
            style={{ left: `${t.position * 100}%` }}
            aria-hidden
          >
            <div className="w-px h-full" style={{ background: 'var(--line-soft)' }} />
            <div className="absolute -bottom-5 -translate-x-1/2 text-[10px] tabular text-[var(--ink-muted)] whitespace-nowrap">
              {t.dayOffset === 0 ? todayLabel(now) : `+${t.dayOffset}d`}
            </div>
          </div>
        ))}

        {/* Today marker */}
        <div
          className="absolute inset-y-0 z-10"
          style={{ left: `${model.todayPosition * 100}%` }}
          aria-hidden
        >
          <div className="w-[2px] h-full rounded-full" style={{ background: 'var(--accent)' }} />
        </div>

        {/* Marks */}
        {model.marks.map((m) => {
          const vars = TONE_VARS[m.tone];
          // Flip the label to the left side when the mark sits near the right edge.
          const flip = m.position > 0.7;
          return (
            <div
              key={m.id}
              className="absolute z-20 flex items-center gap-1.5"
              style={{
                left: `${m.position * 100}%`,
                top: cfg.laneTop + m.lane * cfg.laneSpacing,
                transform: flip ? 'translateX(-100%)' : undefined,
                flexDirection: flip ? 'row-reverse' : 'row',
              }}
              title={markTitle(m)}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: vars.dot, boxShadow: `0 0 0 4px ${vars.ring}` }}
              />
              <span className="text-[11.5px] font-medium text-[var(--ink)] whitespace-nowrap max-w-[110px] truncate">
                {m.medicationName}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3 flex-wrap text-[11px] text-[var(--ink-muted)]">
        {(() => {
          const counts = legendCounts(model.marks);
          return (
            <>
              <LegendDot tone="overdue" label="overdue" count={counts.overdue} />
              <LegendDot tone="soon" label="within a week" count={counts.soon} />
              <LegendDot tone="later" label="later" count={counts.later} />
              <LegendDot tone="done" label="ready / filled" count={counts.done} />
            </>
          );
        })()}
      </div>
    </div>
  );
}

function LegendDot({ tone, label, count }: { tone: TimelineTone; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full" style={{ background: TONE_VARS[tone].dot }} />
      {label}
      {count > 0 && (
        <span className="tabular font-medium text-[var(--ink)]">{legendCountSuffix(count).trim()}</span>
      )}
    </span>
  );
}
