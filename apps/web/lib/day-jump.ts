/**
 * day-jump — find the nearest day that actually has doses, for the drilldown.
 *
 * When a user steps the day-drilldown panel onto an empty day (a rest day), the
 * panel offers a "jump to next day with doses" affordance rather than making
 * them click through blanks. This module scans forward (or backward) from a
 * given day key over the SAME recurrence set the panel renders, stopping at the
 * first day with at least one dose, up to a bounded horizon (default 14 days).
 *
 * It reuses dosesForDay so "has doses" matches exactly what the panel shows.
 * The scan is bounded so an all-empty schedule can never loop. Pure: no React,
 * no Date.now() (day stepping is calendar math on the key).
 */

import { dosesForDay, type DayScheduleLike } from './day-doses';
import { stepDay } from './day-step';

export const DEFAULT_JUMP_HORIZON = 14;

export interface DayJumpResult {
  /** The day key that has doses, or null when none within the horizon. */
  dayKey: string | null;
  /** Whole days from the start key to the found day (positive forward). */
  distance: number;
  /** Doses on the found day (0 when none found). */
  doseCount: number;
}

/**
 * Scan from `fromKey` in `dir` (+1 forward, -1 backward) for the first day with
 * doses, EXCLUDING `fromKey` itself, up to `horizon` days. Returns the found
 * day plus its distance + dose count, or a null result when the horizon is
 * exhausted.
 */
export function findNextDayWithDoses(
  fromKey: string,
  recurrences: readonly DayScheduleLike[],
  dir: 1 | -1 = 1,
  horizon: number = DEFAULT_JUMP_HORIZON,
): DayJumpResult {
  const steps = Math.max(0, Math.trunc(horizon));
  let key = fromKey;
  for (let i = 1; i <= steps; i++) {
    key = stepDay(key, dir);
    const summary = dosesForDay(key, recurrences);
    if (summary.total > 0) {
      return { dayKey: key, distance: i * dir, doseCount: summary.total };
    }
  }
  return { dayKey: null, distance: 0, doseCount: 0 };
}

/** Convenience: forward-only scan (the panel's "next day with doses"). */
export function nextDayWithDoses(
  fromKey: string,
  recurrences: readonly DayScheduleLike[],
  horizon: number = DEFAULT_JUMP_HORIZON,
): DayJumpResult {
  return findNextDayWithDoses(fromKey, recurrences, 1, horizon);
}

/**
 * Phrasing for the jump button given a result + the relative day label resolver
 * the panel already uses. Returns null when there is nothing to jump to so the
 * caller can hide the control. E.g. "Jump to Tomorrow" or "Jump ahead 3 days".
 */
export function jumpLabel(
  result: DayJumpResult,
  relativeLabel: (dayKey: string) => string,
): string | null {
  if (!result.dayKey) return null;
  const rel = relativeLabel(result.dayKey);
  // "Today/Tomorrow/Yesterday" read naturally with "to"; the "In N days" /
  // "N days ago" forms read better folded into "ahead/back".
  if (rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday') {
    return `Jump to ${rel}`;
  }
  const n = Math.abs(result.distance);
  const unit = `${n} day${n === 1 ? '' : 's'}`;
  return result.distance >= 0 ? `Jump ahead ${unit}` : `Jump back ${unit}`;
}
