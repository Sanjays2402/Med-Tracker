'use client';

import * as React from 'react';
import Link from 'next/link';
import { Clock, Check, ArrowRight, BellRinging } from '@med/icons';
import { buildDoseCountdown, clockLabel } from '../lib/countdown';
import type { NextDoseInput } from '../lib/next-dose';

/**
 * NextDoseCountdown — a live "next dose in 1h 12m" card for the dashboard.
 *
 * Derives the soonest pending dose from the day's dose list (via lib/countdown,
 * which composes lib/next-dose) and re-renders once a minute so the readout
 * stays honest without a full page reload. Tone tracks the dose state:
 *   upcoming -> accent, due -> amber, overdue -> coral, none -> calm "all done".
 *
 * Pure presentation: all the date math lives in lib/countdown.ts (tested). The
 * only state here is the 1-minute clock tick.
 */

export interface NextDoseCountdownProps {
  /** The day's doses (any status); the soonest pending one is chosen. */
  doses: readonly (NextDoseInput & { medicationName?: string; strength?: string; medicationId?: string })[];
  /** Optional quick-take handler for the chosen dose. */
  onTake?: (id: string) => void;
  /** True while the row is being logged (disables the take button). */
  takingId?: string | null;
}

const TONE_STYLE: Record<
  'upcoming' | 'due' | 'overdue' | 'none',
  { ring: string; fg: string; bg: string; label: string }
> = {
  upcoming: { ring: 'var(--accent)', fg: 'var(--accent-ink)', bg: 'var(--accent-soft)', label: 'next dose' },
  due: { ring: 'var(--warn)', fg: 'var(--warn)', bg: 'var(--warn-bg)', label: 'due now' },
  overdue: { ring: 'var(--danger)', fg: 'var(--danger)', bg: 'var(--danger-bg)', label: 'overdue' },
  none: { ring: 'var(--ok)', fg: 'var(--ok)', bg: 'var(--ok-bg)', label: 'all done' },
};

export function NextDoseCountdown({ doses, onTake, takingId }: NextDoseCountdownProps) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const model = buildDoseCountdown(doses, now);
  const tone = TONE_STYLE[model.tone];
  const chosen = model.doseId
    ? doses.find((d) => d.id === model.doseId)
    : undefined;

  return (
    <div
      className="sheet p-5 flex items-center gap-5"
      style={{ borderColor: model.hasNext ? `color-mix(in srgb, ${tone.ring} 26%, var(--line))` : undefined }}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${model.overdue ? 'anim-overdue' : ''}`}
        style={{ background: tone.bg, color: tone.fg }}
        aria-hidden
      >
        {model.hasNext ? (model.overdue ? <BellRinging size={24} /> : <Clock size={24} />) : <Check size={24} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="eyebrow" style={{ color: tone.fg }}>{tone.label}</div>
        {model.hasNext ? (
          <>
            <div className="display text-[26px] leading-none tracking-tight mt-1 tabular">
              {model.overdue ? (
                <span style={{ color: 'var(--danger)' }}>
                  {model.hours > 0 && <>{model.hours}<span className="text-[var(--ink-muted)] text-[16px]">h</span> </>}
                  {model.minutes}<span className="text-[var(--ink-muted)] text-[16px]">m</span>
                  <span className="text-[var(--ink-muted)] text-[15px] font-normal not-tabular"> late</span>
                </span>
              ) : (
                <>
                  {model.hours > 0 && <>{model.hours}<span className="text-[var(--ink-muted)] text-[16px]">h</span> </>}
                  {model.minutes}<span className="text-[var(--ink-muted)] text-[16px]">m</span>
                </>
              )}
            </div>
            <div className="text-[12.5px] text-[var(--ink-muted)] mt-1.5 truncate">
              {chosen?.medicationName ? (
                <>
                  {chosen.medicationName}
                  {chosen.strength ? <span className="text-[var(--ink-muted)]"> {chosen.strength}</span> : null}
                  {chosen.scheduledAt ? <span> · {clockLabel(chosen.scheduledAt)}</span> : null}
                </>
              ) : (
                model.long
              )}
            </div>
          </>
        ) : (
          <>
            <div className="display text-[22px] leading-tight mt-1">All caught up</div>
            <div className="text-[12.5px] text-[var(--ink-muted)] mt-1">No more doses scheduled today.</div>
          </>
        )}
      </div>

      {model.hasNext && chosen ? (
        onTake ? (
          <button
            type="button"
            onClick={() => onTake(chosen.id)}
            disabled={takingId === chosen.id}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50 disabled:pointer-events-none shrink-0"
          >
            {takingId === chosen.id ? 'Logging…' : (<><Check size={14} /> Take</>)}
          </button>
        ) : (
          <Link
            href={chosen.medicationId ? `/medications/${chosen.medicationId}` : '/today'}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--bg-sunk)] shrink-0"
          >
            Open <ArrowRight size={14} />
          </Link>
        )
      ) : null}
    </div>
  );
}
