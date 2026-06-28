/**
 * section-progress — pure per-section progress model for the /today list.
 *
 * Each Morning / Afternoon / Evening / Night section on /today already carries a
 * PartOfDayCounts tally (total / taken / skipped / pending). This module turns
 * that tally into a thin progress-bar model the section header can render: the
 * taken fraction (the good outcome, drawn sage), a skipped fraction drawn as a
 * muted amber sliver beside it, a whole-percent for the aria label, a tone, and
 * a visibility flag so an empty section draws no bar.
 *
 * Fractions are clamped to 0..1 and a taken+skipped overflow can never exceed 1
 * (skipped is capped at the remaining width after taken) so the two segments
 * always fit the track. No React, no Date. Composes lib/part-of-day's counts.
 */

import type { PartOfDayCounts } from './part-of-day';
import { progressTone, type ProgressTone } from './progress-tone';

export interface SectionProgress {
  total: number;
  taken: number;
  skipped: number;
  pending: number;
  /** Fraction of the section that's been taken, 0..1 (0 when empty). */
  takenFraction: number;
  /** Fraction that's been skipped, 0..1, capped so taken+skipped <= 1. */
  skippedFraction: number;
  /** Whole-percent taken (0..100), for the aria label and caption. */
  takenPct: number;
  /** True when every dose in the section is taken. */
  complete: boolean;
  /** True when nothing is pending (all doses acted on: taken/skipped/missed). */
  settled: boolean;
  /** Fill tone: complete -> ok, any taken -> accent, otherwise neutral track. */
  tone: 'ok' | 'accent' | 'neutral';
  /** Worth rendering only when the section actually holds doses. */
  visible: boolean;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

/**
 * Build the progress model for one section from its counts. The taken segment
 * leads; the skipped segment fills only the width left after taken so the two
 * never sum past the track. Tone celebrates a fully-taken section (ok), marks a
 * partially-taken one (accent), and leaves an untouched section neutral.
 */
export function sectionProgress(counts: PartOfDayCounts): SectionProgress {
  const total = Math.max(0, Math.floor(counts.total));
  if (total === 0) {
    return {
      total: 0,
      taken: 0,
      skipped: 0,
      pending: 0,
      takenFraction: 0,
      skippedFraction: 0,
      takenPct: 0,
      complete: false,
      settled: false,
      tone: 'neutral',
      visible: false,
    };
  }
  const taken = Math.max(0, Math.min(total, Math.floor(counts.taken)));
  const skipped = Math.max(0, Math.min(total, Math.floor(counts.skipped)));
  const pending = Math.max(0, Math.min(total, Math.floor(counts.pending)));

  const takenFraction = clamp01(taken / total);
  // Cap skipped to the space left after taken so the two bars always fit.
  const skippedFraction = clamp01(Math.min(skipped / total, 1 - takenFraction));

  const complete = taken === total;
  const tone: SectionProgress['tone'] = complete ? 'ok' : taken > 0 ? 'accent' : 'neutral';

  return {
    total,
    taken,
    skipped,
    pending,
    takenFraction,
    skippedFraction,
    takenPct: Math.round(takenFraction * 100),
    complete,
    settled: counts.done,
    tone,
    visible: true,
  };
}

/**
 * Short accessible description of the section's progress, e.g.
 * "2 of 3 doses taken" / "all 3 doses taken" / "no doses taken yet". Null for an
 * empty section (the bar isn't rendered there).
 */
export function sectionProgressLabel(counts: PartOfDayCounts): string | null {
  const p = sectionProgress(counts);
  if (!p.visible) return null;
  const noun = p.total === 1 ? 'dose' : 'doses';
  if (p.complete) return p.total === 1 ? 'dose taken' : `all ${p.total} ${noun} taken`;
  if (p.taken === 0) return `no ${noun} taken yet`;
  return `${p.taken} of ${p.total} ${noun} taken`;
}

/**
 * The fill tone for the section's progress bar, derived from its OWN taken
 * percentage via the shared thirds classifier (lib/progress-tone): a section
 * barely started reads coral (danger), one underway amber (warn), one nearly
 * done or complete sage (ok). This lets a glance down the /today list read which
 * blocks of the day are behind without scanning each section's numbers, and it
 * stays in lock-step with the toned day-percent prefix the page already leads
 * with (both go through progressTone).
 *
 * Returns null for an empty (invisible) section so the caller can fall back to
 * its neutral track. A complete section is forced to 'ok' even though 100 would
 * classify there anyway, making the intent explicit.
 */
export function sectionFillTone(counts: PartOfDayCounts): ProgressTone | null {
  const p = sectionProgress(counts);
  if (!p.visible) return null;
  if (p.complete) return 'ok';
  return progressTone(p.takenPct);
}
