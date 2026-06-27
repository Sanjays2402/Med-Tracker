/**
 * refill-sort — pure sort model for the /refills list.
 *
 * The refills page groups items by status, but within a status a user wants to
 * see what runs out SOONEST first. This module adds a sort control (Default /
 * Soonest run-out) and the days-until-refill comparator so the page stays a
 * thin render and the ordering stays unit-tested. Parallels lib/medication-sort.
 *
 * "Soonest run-out" orders by the refill-by date ascending (most overdue first,
 * then nearest future), with unparseable dates pushed to the end so a refill
 * with a bad date never floats to the top. "Default" preserves the server /
 * input order. `now` is injectable so the comparator is deterministic in tests.
 */

import type { Refill } from './types';

export type RefillSortKey = 'default' | 'runout';

export interface RefillSortOption {
  key: RefillSortKey;
  label: string;
}

export const REFILL_SORTS: RefillSortOption[] = [
  { key: 'default', label: 'Default' },
  { key: 'runout', label: 'Soonest run-out' },
];

/**
 * Whole days from `now` until the refill-by date (negative when overdue),
 * or null when the date is missing/unparseable so the caller can sort it last.
 * Uses ceil so "later today" reads as 0 and tomorrow reads as 1, matching the
 * "Nd left" chip the page already renders.
 */
export function refillDaysUntil(refill: Pick<Refill, 'refillBy'>, now: number = Date.now()): number | null {
  const t = Date.parse(refill.refillBy);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

/**
 * Ascending comparator that sorts null/undefined to the end. Returns 0 on a tie
 * so the caller can fall through to a name tiebreak (`|| byName`).
 */
function nullsLast(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return a - b;
}

/**
 * Sort a COPY of the list by the chosen key. "runout" orders by soonest
 * refill-by date (nulls last, name A-Z tiebreak); "default" returns the input
 * order unchanged (a fresh copy so callers can mutate freely).
 */
export function sortRefills(
  refills: readonly Refill[],
  by: RefillSortKey,
  now: number = Date.now(),
): Refill[] {
  if (by === 'default') return [...refills];
  const byName = (a: Refill, b: Refill) =>
    a.medicationName.localeCompare(b.medicationName, undefined, { sensitivity: 'base' });
  return [...refills].sort(
    (a, b) => nullsLast(refillDaysUntil(a, now), refillDaysUntil(b, now)) || byName(a, b),
  );
}

export interface RefillSortSummary {
  refills: Refill[];
  sorting: boolean;
  /** Days-until of the soonest refill in the sorted list, or null when empty/unknown. */
  soonestDays: number | null;
}

/**
 * Sort plus a small headline the control can show. `soonestDays` reads the
 * first sorted row's days-until (only meaningful under the runout sort) so the
 * page can surface "next out in Nd" without recomputing.
 */
export function summarizeRefillSort(
  refills: readonly Refill[],
  by: RefillSortKey,
  now: number = Date.now(),
): RefillSortSummary {
  const sorted = sortRefills(refills, by, now);
  const soonestDays = by === 'runout' && sorted.length ? refillDaysUntil(sorted[0]!, now) : null;
  return { refills: sorted, sorting: by !== 'default', soonestDays };
}

/**
 * Phrase the soonest run-out days as a compact chip label, or null when there
 * is nothing to show (no soonest, or the value is unknown). Used beside the
 * sort control so a user reading the runout sort sees what's about to go dry:
 *   - overdue   -> "soonest overdue"
 *   - 0 days    -> "next out today"
 *   - 1 day     -> "next out tomorrow"
 *   - N days    -> "next out in Nd"
 */
export function formatSoonestRunout(days: number | null | undefined): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  const d = Math.trunc(days);
  if (d < 0) return 'soonest overdue';
  if (d === 0) return 'next out today';
  if (d === 1) return 'next out tomorrow';
  return `next out in ${d}d`;
}

/**
 * Tone hint for the soonest-run-out chip: danger when it's overdue or within a
 * few days, warn otherwise, neutral when there is nothing to show. Mirrors the
 * per-row "Nd left" pill thresholds the list already uses.
 */
export function soonestRunoutTone(days: number | null | undefined): 'danger' | 'warn' | 'neutral' {
  if (days == null || !Number.isFinite(days)) return 'neutral';
  return Math.trunc(days) <= 3 ? 'danger' : 'warn';
}

export interface ActiveRunoutChip {
  /** Days until the soonest active refill runs out (negative when overdue). */
  days: number;
  /** Render-ready label ("next out in 3d", "soonest overdue"). */
  label: string;
  /** Pill tone for the chip. */
  tone: 'danger' | 'warn' | 'neutral';
}

/**
 * Build an always-on "next out in Nd" chip for the soonest of a set of refills,
 * independent of the active sort. The refills page used to gate the chip on the
 * runout sort being active; this lets it surface on every status tab so the
 * user always sees what's about to go dry.
 *
 * Pass the refills you consider "active" (typically everything but picked-up).
 * Returns null when the set is empty or no refill has a parseable date (nothing
 * honest to show). The soonest is computed via the same runout ordering, so the
 * chip and a runout-sorted list always agree on which refill is first.
 */
export function activeRunoutChip(
  refills: readonly Refill[],
  now: number = Date.now(),
): ActiveRunoutChip | null {
  const days = summarizeRefillSort(refills, 'runout', now).soonestDays;
  const label = formatSoonestRunout(days);
  if (days == null || label == null) return null;
  return { days, label, tone: soonestRunoutTone(days) };
}
