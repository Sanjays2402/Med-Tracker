/**
 * day-progress-roll — pure roll-up of the four /today section progress bars into
 * one day-spanning summary line.
 *
 * Each Morning / Afternoon / Evening / Night section already renders a thin
 * progress bar from lib/section-progress. This module rolls those per-section
 * states into a single sentence the page can show under the Today header, e.g.
 * "2 of 3 morning, all afternoon taken, evening up next" — so a glance at the
 * top of the day tells you where you stand without scanning every section.
 *
 * It composes groupByPartOfDay's groups + sectionProgress, owns the phrasing,
 * and stays free of React/Date. Empty sections are dropped; a wholly empty day
 * yields null (nothing to summarise).
 */

import type { PartOfDayGroup, PartOfDayDose, PartOfDay } from './part-of-day';
import { sectionProgress } from './section-progress';

/** Lower-case section word for the inline phrase ("morning"). */
const SECTION_WORD: Record<PartOfDay, string> = {
  Morning: 'morning',
  Afternoon: 'afternoon',
  Evening: 'evening',
  Night: 'night',
};

export interface SectionRollPart {
  label: PartOfDay;
  /** Doses in the section. */
  total: number;
  /** Doses taken. */
  taken: number;
  /** Every dose taken. */
  complete: boolean;
  /** Per-section phrase, e.g. "all morning taken" / "2 of 3 afternoon". */
  phrase: string;
}

export interface DayProgressRoll {
  /** Per-non-empty-section breakdown in display order. */
  parts: SectionRollPart[];
  /** Total scheduled doses across the day. */
  total: number;
  /** Total taken across the day. */
  taken: number;
  /** Every scheduled dose for the day is taken. */
  allComplete: boolean;
  /** The full joined summary line. */
  summary: string;
}

/** Phrase one section's progress for the inline roll-up. */
function phraseFor(label: PartOfDay, total: number, taken: number, complete: boolean): string {
  const word = SECTION_WORD[label];
  if (complete) return `all ${word} taken`;
  if (taken === 0) return `${word} not started`;
  return `${taken} of ${total} ${word}`;
}

/**
 * Roll the part-of-day groups into a day summary, or null when the day holds no
 * doses at all. Only non-empty sections contribute a phrase (an empty section
 * isn't mentioned). The summary joins the section phrases with commas; when the
 * whole day is done it collapses to a single "all N doses taken" line.
 */
export function dayProgressRoll<T extends PartOfDayDose>(
  groups: readonly PartOfDayGroup<T>[],
): DayProgressRoll | null {
  const parts: SectionRollPart[] = [];
  let total = 0;
  let taken = 0;

  for (const g of groups) {
    const p = sectionProgress(g.counts);
    if (!p.visible) continue; // skip empty sections
    total += p.total;
    taken += p.taken;
    parts.push({
      label: g.label,
      total: p.total,
      taken: p.taken,
      complete: p.complete,
      phrase: phraseFor(g.label, p.total, p.taken, p.complete),
    });
  }

  if (parts.length === 0 || total === 0) return null;

  const allComplete = taken === total;
  const summary = allComplete
    ? `All ${total} dose${total === 1 ? '' : 's'} taken`
    : parts.map((p) => p.phrase).join(', ');

  return { parts, total, taken, allComplete, summary };
}
