/**
 * countdown — dashboard "next dose" countdown card model.
 *
 * Composes lib/next-dose.ts (which already picks the most relevant pending dose
 * and gives a signed delta + tone) and adds the presentation pieces the
 * dashboard card needs: a long humanised duration ("1 hour 12 minutes"), the
 * split hour/minute parts for a big tabular readout, and a clock label for the
 * dose's scheduled time. Pure + injected `now` so the 1-minute tick on the
 * dashboard stays a thin re-render.
 */

import { computeNextDose, type NextDoseInput, type NextDoseTone } from './next-dose';

export interface DoseCountdownModel {
  /** Dose id this countdown refers to, or null when nothing is pending. */
  doseId: string | null;
  tone: NextDoseTone;
  /** Signed ms until the dose (negative = past). null when nothing pending. */
  deltaMs: number | null;
  /** Whole hours of the absolute remaining/overdue time. */
  hours: number;
  /** Whole minutes (0..59) of the absolute remaining/overdue time. */
  minutes: number;
  /** Long humanised phrase: "1 hour 12 minutes", "in a moment", etc. */
  long: string;
  /** True when the chosen dose is overdue. */
  overdue: boolean;
  /** True when there's a pending dose to count down to. */
  hasNext: boolean;
}

/** Split an absolute millisecond span into whole hours + minutes (0..59). */
export function splitDuration(absMs: number): { hours: number; minutes: number } {
  const totalMin = Math.round(Math.max(0, absMs) / 60_000);
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

/**
 * Long-form humanised duration for the card subline. Pluralises units and
 * drops zero parts. `direction` shapes the phrasing:
 *  - 'until'  → "in 1 hour 12 minutes" / "due now"
 *  - 'since'  → "1 hour 12 minutes ago"
 *  - 'bare'   → "1 hour 12 minutes"
 */
export function humanizeDuration(
  absMs: number,
  direction: 'until' | 'since' | 'bare' = 'bare',
): string {
  const { hours, minutes } = splitDuration(absMs);
  if (hours === 0 && minutes === 0) {
    if (direction === 'until') return 'due now';
    if (direction === 'since') return 'just now';
    return 'less than a minute';
  }
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  const body = parts.join(' ');
  if (direction === 'until') return `in ${body}`;
  if (direction === 'since') return `${body} ago`;
  return body;
}

/**
 * Build the dashboard countdown card model from a list of pending/other dose
 * events for the day.
 */
export function buildDoseCountdown(
  doses: readonly NextDoseInput[],
  now: number = Date.now(),
): DoseCountdownModel {
  const next = computeNextDose(doses, now);
  if (next.doseId === null || next.deltaMs === null) {
    return {
      doseId: null,
      tone: 'none',
      deltaMs: null,
      hours: 0,
      minutes: 0,
      long: 'All caught up for today',
      overdue: false,
      hasNext: false,
    };
  }
  const overdue = next.tone === 'overdue';
  const { hours, minutes } = splitDuration(Math.abs(next.deltaMs));
  const long = overdue
    ? humanizeDuration(Math.abs(next.deltaMs), 'since')
    : humanizeDuration(next.deltaMs, 'until');
  return {
    doseId: next.doseId,
    tone: next.tone,
    deltaMs: next.deltaMs,
    hours,
    minutes,
    long,
    overdue,
    hasNext: true,
  };
}

/** Format an ISO time as a compact clock label, e.g. "8:00 AM". */
export function clockLabel(iso: string): string {
  const t = +new Date(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
