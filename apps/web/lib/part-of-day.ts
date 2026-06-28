/**
 * part-of-day — pure time-of-day bucketing + per-section counts for /today.
 *
 * The Today page groups the day's doses into Morning / Afternoon / Evening /
 * Night sections. This module owns the hour thresholds, the grouping pass, and a
 * small per-section count model (total + taken + remaining + a "done" flag) so
 * each section header can show "2 of 3 taken" without the page recomputing it,
 * and so the bucketing stays unit-tested instead of inlined.
 *
 * Buckets (matching the page's existing thresholds):
 *   Morning   00:00-11:59
 *   Afternoon 12:00-16:59
 *   Evening   17:00-20:59
 *   Night     21:00-23:59
 *
 * No React. The hour comes from a Date built off the dose's scheduledAt, so the
 * bucket follows the viewer's local timezone exactly as the page renders it.
 */

export type PartOfDay = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

/** Sections in display order. */
export const PART_OF_DAY_LABELS: PartOfDay[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

/** Minimal dose shape this module needs (matches DoseEvent's relevant fields). */
export interface PartOfDayDose {
  scheduledAt: string;
  status: 'pending' | 'taken' | 'skipped' | 'missed';
}

/** Classify an hour-of-day (0..23) into a section. */
export function partOfDayForHour(hour: number): PartOfDay {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 0;
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 21) return 'Evening';
  return 'Night';
}

/** Classify an ISO timestamp into a section using its local hour. */
export function partOfDayForISO(iso: string): PartOfDay {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'Morning';
  return partOfDayForHour(t.getHours());
}

export interface PartOfDayCounts {
  /** Doses scheduled in this section. */
  total: number;
  /** Doses marked taken. */
  taken: number;
  /** Doses skipped. */
  skipped: number;
  /** Doses still pending (not yet acted on). */
  pending: number;
  /** True when nothing in the section is still pending (all acted on). */
  done: boolean;
}

/** Tally a section's doses by status. An empty section is `done: false`. */
export function countDoses(doses: readonly PartOfDayDose[]): PartOfDayCounts {
  let taken = 0;
  let skipped = 0;
  let pending = 0;
  for (const d of doses) {
    if (d.status === 'taken') taken++;
    else if (d.status === 'skipped') skipped++;
    else if (d.status === 'pending') pending++;
  }
  const total = doses.length;
  return { total, taken, skipped, pending, done: total > 0 && pending === 0 };
}

export interface PartOfDayGroup<T extends PartOfDayDose> {
  label: PartOfDay;
  doses: T[];
  counts: PartOfDayCounts;
}

/**
 * Bucket doses into the four sections in display order. Each group carries its
 * doses (input order preserved within a section) and a count tally. EMPTY
 * sections are kept (the page skips rendering them) so callers always get all
 * four labels in a stable order. The input is never mutated.
 */
export function groupByPartOfDay<T extends PartOfDayDose>(
  doses: readonly T[],
): PartOfDayGroup<T>[] {
  const byLabel = new Map<PartOfDay, T[]>();
  for (const label of PART_OF_DAY_LABELS) byLabel.set(label, []);
  for (const d of doses) byLabel.get(partOfDayForISO(d.scheduledAt))!.push(d);
  return PART_OF_DAY_LABELS.map((label) => {
    const group = byLabel.get(label)!;
    return { label, doses: group, counts: countDoses(group) };
  });
}

/**
 * Compact "N" or "M of N taken" caption for a section header. Returns null for
 * an empty section (no chip). When everything's taken it reads "all N taken";
 * otherwise "M of N taken" so a glance shows the section's progress.
 */
export function sectionCountLabel(counts: PartOfDayCounts): string | null {
  if (counts.total === 0) return null;
  if (counts.taken === counts.total) {
    return counts.total === 1 ? 'taken' : `all ${counts.total} taken`;
  }
  return `${counts.taken} of ${counts.total} taken`;
}

/**
 * Which part-of-day section the OLDEST overdue dose lives in, so the /today page
 * can flag exactly one section header with a danger dot pointing at where the
 * longest-waiting overdue dose sits. `firstOverdueScheduledAt` is the
 * OverdueModel's earliest-overdue timestamp (already sorted earliest-first);
 * pass it straight through. Returns null when nothing is overdue (no flag).
 * Composes partOfDayForISO so the flagged section always matches the bucket the
 * page renders that dose under. Pure.
 */
export function sectionForOverdue(
  firstOverdueScheduledAt: string | null,
): PartOfDay | null {
  if (!firstOverdueScheduledAt) return null;
  return partOfDayForISO(firstOverdueScheduledAt);
}

/** The minimal overdue-dose shape this module needs (an ISO scheduledAt). */
export interface OverdueLike {
  scheduledAt: string;
}

/**
 * Count overdue doses per part-of-day section. The /today flag points a danger
 * dot at the section holding the oldest overdue dose; when MORE than one overdue
 * dose sits in that section, the flag wants to say how many are waiting there
 * ("2"). This tallies the overdue set by bucket so the header reads the count
 * for ITS section without the page re-walking the doses.
 *
 * Pass the OverdueModel's `overdue` array (already grace-filtered + sorted).
 * Every section key is present (0 when none) so a lookup never misses. Pure;
 * composes partOfDayForISO so the buckets match the rendered grouping exactly.
 */
export function countOverdueByPartOfDay(
  overdue: readonly OverdueLike[],
): Record<PartOfDay, number> {
  const out: Record<PartOfDay, number> = {
    Morning: 0,
    Afternoon: 0,
    Evening: 0,
    Night: 0,
  };
  for (const d of overdue) out[partOfDayForISO(d.scheduledAt)]++;
  return out;
}

/**
 * Render-ready count for the danger dot on a flagged section header. Returns the
 * number of overdue doses in `section` ONLY when it is the flagged section (the
 * one holding the oldest overdue dose) AND more than one overdue dose sits there
 * — so the flag shows "2" when several are waiting but stays a bare dot for a
 * single one (the count would be redundant). Returns null otherwise.
 *
 * `flagged` is sectionForOverdue's result; `counts` is countOverdueByPartOfDay's
 * tally. Keeping the >1 rule here means the page just renders the number when it
 * isn't null. Pure.
 */
export function overdueSectionCount(
  section: PartOfDay,
  flagged: PartOfDay | null,
  counts: Record<PartOfDay, number>,
): number | null {
  if (flagged !== section) return null;
  const n = counts[section];
  return n > 1 ? n : null;
}
