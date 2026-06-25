/**
 * adherence-bars — pure model for the per-medication adherence bar chart.
 *
 * The reports page replaces a single flat adherence number with a horizontal
 * bar per medication so a clinician can see at a glance WHICH medication is
 * dragging the average down. This module turns raw per-med taken/scheduled
 * counts into sorted, toned bars: worst adherence first, each with a percent,
 * a clamped bar width, and a tone from the ramp (coral < 70 < amber < 90 sage).
 *
 * No React, no Date.now() - fully deterministic under test.
 */

export interface MedAdherenceInput {
  medicationId: string;
  medicationName: string;
  /** Doses taken in the window. */
  taken: number;
  /** Doses scheduled in the window. */
  scheduled: number;
}

export type AdherenceTone = 'ok' | 'warn' | 'danger';

export interface AdherenceBar {
  medicationId: string;
  medicationName: string;
  taken: number;
  scheduled: number;
  /** Integer adherence percent 0..100 (0 when nothing was scheduled). */
  pct: number;
  tone: AdherenceTone;
  /** Bar width as a percent 0..100 for the rendered track. */
  width: number;
  /** True when nothing was scheduled, so the bar reads "no doses" not "0%". */
  empty: boolean;
}

export interface AdherenceBarsSummary {
  bars: AdherenceBar[];
  /** Weighted overall percent across all meds (sum taken / sum scheduled). */
  overallPct: number;
  /** The single worst non-empty bar, or null when there are none. */
  worst: AdherenceBar | null;
  /** Count of meds at or below the danger threshold. */
  flaggedCount: number;
}

export const ADHERENCE_THRESHOLDS = { danger: 70, warn: 90 } as const;

/** Minimum rendered width so a non-zero, non-empty bar is always visible. */
const MIN_VISIBLE_WIDTH = 2;

export function adherencePct(taken: number, scheduled: number): number {
  if (scheduled <= 0) return 0;
  const raw = (taken / scheduled) * 100;
  // Clamp into 0..100 (a double-logged dose should never read 110%).
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function adherenceTone(pct: number): AdherenceTone {
  if (pct < ADHERENCE_THRESHOLDS.danger) return 'danger';
  if (pct < ADHERENCE_THRESHOLDS.warn) return 'warn';
  return 'ok';
}

/**
 * Build the sorted, toned bar set. Worst adherence renders first so the rows a
 * clinician should act on float to the top; ties break by name A-Z. Meds with
 * nothing scheduled sort to the very bottom (they carry no signal) and are
 * marked `empty` so the UI can label them "no doses" rather than a red 0%.
 */
export function buildAdherenceBars(rows: readonly MedAdherenceInput[]): AdherenceBarsSummary {
  const bars: AdherenceBar[] = rows.map((r) => {
    const empty = r.scheduled <= 0;
    const pct = adherencePct(r.taken, r.scheduled);
    return {
      medicationId: r.medicationId,
      medicationName: r.medicationName,
      taken: r.taken,
      scheduled: r.scheduled,
      pct,
      tone: adherenceTone(pct),
      width: empty ? 0 : Math.max(MIN_VISIBLE_WIDTH, pct),
      empty,
    };
  });

  bars.sort((a, b) => {
    // Empty bars last.
    if (a.empty !== b.empty) return a.empty ? 1 : -1;
    // Worst (lowest pct) first.
    if (a.pct !== b.pct) return a.pct - b.pct;
    // Tiebreak by name.
    return a.medicationName.localeCompare(b.medicationName, undefined, { sensitivity: 'base' });
  });

  const totalTaken = rows.reduce((s, r) => s + Math.max(0, r.taken), 0);
  const totalScheduled = rows.reduce((s, r) => s + Math.max(0, r.scheduled), 0);
  const overallPct = adherencePct(totalTaken, totalScheduled);

  const nonEmpty = bars.filter((b) => !b.empty);
  const worst = nonEmpty.length > 0 ? nonEmpty[0]! : null;
  const flaggedCount = nonEmpty.filter((b) => b.pct < ADHERENCE_THRESHOLDS.danger).length;

  return { bars, overallPct, worst, flaggedCount };
}
