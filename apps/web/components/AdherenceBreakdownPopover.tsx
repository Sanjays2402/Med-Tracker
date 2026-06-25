'use client';

import * as React from 'react';
import { Check, X as XIcon, Minus } from '@med/icons';
import { computeBreakdown, type AdherenceBreakdown, type BreakdownSegment } from '../lib/adherence-breakdown';

/**
 * AdherenceBreakdownPopover — wraps a trigger (the dashboard adherence ring) in
 * a click target that opens a popover breaking the adherence window into
 * taken / skipped / missed counts, each with a capsule and a share of a stacked
 * mini-bar. Closes on outside-click / Escape. The split math lives in
 * lib/adherence-breakdown.
 */

const SEG_VARS: Record<BreakdownSegment['kind'], { fg: string; bg: string; label: string }> = {
  taken: { fg: 'var(--ok)', bg: 'var(--ok-bg)', label: 'Taken' },
  skipped: { fg: 'var(--warn)', bg: 'var(--warn-bg)', label: 'Skipped' },
  missed: { fg: 'var(--danger)', bg: 'var(--danger-bg)', label: 'Missed' },
};

function SegIcon({ kind, size = 13 }: { kind: BreakdownSegment['kind']; size?: number }) {
  if (kind === 'taken') return <Check size={size} />;
  if (kind === 'skipped') return <Minus size={size} />;
  return <XIcon size={size} />;
}

export function AdherenceBreakdownPopover({
  taken,
  scheduled,
  skipped,
  windowDays,
  children,
}: {
  taken: number;
  scheduled: number;
  skipped?: number;
  windowDays: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const breakdown: AdherenceBreakdown = React.useMemo(
    () => computeBreakdown(skipped !== undefined ? { taken, scheduled, skipped } : { taken, scheduled }),
    [taken, scheduled, skipped],
  );

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Adherence ${breakdown.adherencePct}% over ${windowDays} days — show breakdown`}
        className="rounded-full focus:outline-none transition-transform hover:scale-[1.02]"
      >
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Adherence breakdown"
          className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+10px)] z-40 w-64 p-4 anim-toast-in sheet"
          style={{ boxShadow: '0 16px 34px -12px rgba(0,0,0,0.26), 0 4px 10px -4px rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <div className="eyebrow">last {windowDays} days</div>
            <div className="text-[12px] text-[var(--ink-muted)] tabular">
              {breakdown.taken}/{breakdown.scheduled} doses
            </div>
          </div>

          {/* Stacked mini-bar */}
          <div className="flex h-2.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--bg-sunk)' }} aria-hidden>
            {breakdown.segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.kind}
                  style={{ width: `${s.fraction * 100}%`, background: SEG_VARS[s.kind].fg }}
                />
              ))}
          </div>

          <ul className="space-y-2">
            {breakdown.segments.map((s) => (
              <li key={s.kind} className="flex items-center gap-2.5">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: SEG_VARS[s.kind].bg, color: SEG_VARS[s.kind].fg }}
                >
                  <SegIcon kind={s.kind} />
                </span>
                <span className="flex-1 text-[13px] text-[var(--ink)]">{SEG_VARS[s.kind].label}</span>
                <span className="text-[13px] font-medium tabular text-[var(--ink)]">{s.count}</span>
                <span className="text-[11px] tabular text-[var(--ink-muted)] w-9 text-right">{s.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
