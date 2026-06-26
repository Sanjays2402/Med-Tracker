'use client';

import * as React from 'react';
import type { DoseLike, SegmentTone } from '../lib/dose-segments';
import { buildDoseSegments } from '../lib/dose-segments';

/**
 * DoseSegments — the Today page's segmented progress row.
 *
 * One segment per scheduled dose, time-sorted: a solid sage capsule when taken,
 * a hollow track when pending, amber when skipped, coral when missed. Replaces
 * the single flat bar so a glance tells you not just "how far" but exactly which
 * doses are done and which are still open. Each segment is a button that scrolls
 * its matching row into view (the Today rows carry `dose-row-<id>` ids).
 *
 * Purely presentational over buildDoseSegments(); all the counting + ordering
 * lives in the tested lib module.
 */

const TONE_FILL: Record<SegmentTone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  neutral: 'var(--bg-sunk)',
};

function scrollToDose(id: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(`dose-row-${id}`);
  if (!el) return;
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  el.classList.add('anim-pop');
  window.setTimeout(() => el.classList.remove('anim-pop'), 700);
}

export function DoseSegments({ doses }: { doses: readonly DoseLike[] }) {
  const summary = React.useMemo(() => buildDoseSegments(doses), [doses]);

  if (summary.total === 0) return null;

  return (
    <div className="space-y-2">
      <div
        className="flex items-stretch gap-1.5"
        role="group"
        aria-label={summary.caption}
      >
        {summary.segments.map((seg) => {
          const fill = TONE_FILL[seg.tone];
          const isPending = seg.status === 'pending';
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => scrollToDose(seg.id)}
              title={`${seg.label} - ${seg.status}`}
              aria-label={`${seg.label}, ${seg.status}. Jump to dose.`}
              className="group relative flex-1 min-w-0 h-2.5 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
              style={{
                background: isPending ? 'var(--bg-sunk)' : fill,
                border: isPending ? '1px dashed var(--line)' : '1px solid transparent',
              }}
            >
              {/* Hover lift cue */}
              <span
                aria-hidden
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-[var(--ink-muted)]">{summary.caption}</span>
        <span className="text-[12px] tabular text-[var(--ink-soft)]">{summary.pct}%</span>
      </div>
    </div>
  );
}
