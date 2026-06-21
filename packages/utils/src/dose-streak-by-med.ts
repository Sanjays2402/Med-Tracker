/**
 * Per-medication streaks with longest-streak history.
 *
 * The top-level `computeStreak` (streak.ts) collapses every medication
 * into one streak: a day counts if *any* dose was taken. That is a fine
 * headline number, but when a patient is on multiple medications the
 * UX wins by showing each medication's own streak — patients dropping
 * metformin while staying perfect on a statin gets hidden behind a
 * single number.
 *
 * `computeStreaksByMedication` walks the dose log per-medication and
 * returns, for each medication:
 *
 *   - current: the run of consecutive days ending today (or yesterday
 *     with a one-day grace) where at least one scheduled dose was
 *     taken.
 *   - longest: the longest such run ever observed in the data.
 *   - longestRange: ISO start and end dates of the longest run, so the
 *     UI can show "Apr 1 — May 12, 42 days" as a milestone.
 *   - daysObserved: count of distinct calendar days the medication
 *     appears in the dose log (the denominator for "you've taken X
 *     76% of the time").
 *   - lastTakenAt: most recent takenAt for the medication, if any.
 *
 * Pure / deterministic, no I/O. Operates on the same shape `streak.ts`
 * already uses but each dose must include a `medicationId` so the
 * grouping works.
 */

import { addDays, startOfDay } from './date';
import type { DoseLike } from './streak';

export interface MedicationDose extends DoseLike {
  medicationId: string;
}

export interface MedicationStreak {
  medicationId: string;
  current: number;
  longest: number;
  longestRange?: { start: string; end: string };
  daysObserved: number;
  lastTakenAt?: string;
}

export interface ByMedStreakOptions {
  /** Reference "now". Default new Date(). */
  now?: Date;
  /**
   * Grace period in hours after midnight where yesterday's run still
   * counts toward `current` if today has no dose yet. Default 24
   * (i.e. one full day of grace as long as yesterday had a take).
   */
  graceHours?: number;
}

interface InternalState {
  takenDays: Set<number>;
  scheduledDays: Set<number>;
  lastTakenMs: number;
}

function dayKey(date: Date): number {
  return startOfDay(date).getTime();
}

function findLongestRun(takenDays: Set<number>): {
  longest: number;
  range?: { start: number; end: number };
} {
  if (takenDays.size === 0) return { longest: 0 };
  const days = [...takenDays].sort((a, b) => a - b);
  let longest = 0;
  let bestStart = days[0]!;
  let bestEnd = days[0]!;
  let runStart = days[0]!;
  let prev = days[0]!;
  let runLen = 1;

  for (let i = 1; i < days.length; i++) {
    const d = days[i]!;
    if (d - prev === 86_400_000) {
      runLen += 1;
    } else {
      if (runLen > longest) {
        longest = runLen;
        bestStart = runStart;
        bestEnd = prev;
      }
      runStart = d;
      runLen = 1;
    }
    prev = d;
  }
  if (runLen > longest) {
    longest = runLen;
    bestStart = runStart;
    bestEnd = prev;
  }
  return { longest, range: { start: bestStart, end: bestEnd } };
}

function computeCurrent(takenDays: Set<number>, now: Date, graceHours: number): number {
  const today = dayKey(now);
  const yesterday = dayKey(addDays(now, -1));
  // If today has a take, walk back from today.
  // Else if yesterday has a take and we're still inside grace, walk back from yesterday.
  let cursor: number;
  if (takenDays.has(today)) {
    cursor = today;
  } else if (
    takenDays.has(yesterday) &&
    now.getTime() - today < graceHours * 3_600_000
  ) {
    cursor = yesterday;
  } else {
    return 0;
  }
  let n = 0;
  while (takenDays.has(cursor)) {
    n += 1;
    cursor -= 86_400_000;
  }
  return n;
}

export function computeStreaksByMedication(
  doses: MedicationDose[],
  options: ByMedStreakOptions = {},
): MedicationStreak[] {
  const now = options.now ?? new Date();
  const graceHours = options.graceHours ?? 24;

  const byMed = new Map<string, InternalState>();
  for (const d of doses) {
    if (!d.medicationId) continue;
    let state = byMed.get(d.medicationId);
    if (!state) {
      state = {
        takenDays: new Set<number>(),
        scheduledDays: new Set<number>(),
        lastTakenMs: -1,
      };
      byMed.set(d.medicationId, state);
    }
    state.scheduledDays.add(dayKey(new Date(d.dueAt)));
    if (d.takenAt) {
      const taken = new Date(d.takenAt);
      state.takenDays.add(dayKey(taken));
      const ms = taken.getTime();
      if (ms > state.lastTakenMs) state.lastTakenMs = ms;
    }
  }

  const out: MedicationStreak[] = [];
  for (const [medicationId, state] of byMed) {
    const { longest, range } = findLongestRun(state.takenDays);
    const current = computeCurrent(state.takenDays, now, graceHours);
    const entry: MedicationStreak = {
      medicationId,
      current,
      longest,
      daysObserved: state.scheduledDays.size,
    };
    if (range) {
      entry.longestRange = {
        start: new Date(range.start).toISOString(),
        end: new Date(range.end).toISOString(),
      };
    }
    if (state.lastTakenMs >= 0) {
      entry.lastTakenAt = new Date(state.lastTakenMs).toISOString();
    }
    out.push(entry);
  }

  // Most active first (current desc, then longest desc, then id for stability).
  out.sort((a, b) => {
    if (b.current !== a.current) return b.current - a.current;
    if (b.longest !== a.longest) return b.longest - a.longest;
    return a.medicationId.localeCompare(b.medicationId);
  });

  return out;
}

/**
 * Convenience: pick the medication with the longest active streak.
 * Useful for "this is your strongest habit right now" UI.
 */
export function topActiveStreak(
  streaks: MedicationStreak[],
): MedicationStreak | undefined {
  if (!streaks.length) return undefined;
  return [...streaks].sort((a, b) => b.current - a.current)[0];
}

/**
 * Convenience: which medications dropped a streak relative to yesterday?
 * Returns medications whose `current` is 0 but `longest >= minLongest`
 * (default 3) — those are the ones the UI should nudge first.
 */
export function streaksAtRisk(
  streaks: MedicationStreak[],
  minLongest = 3,
): MedicationStreak[] {
  return streaks.filter((s) => s.current === 0 && s.longest >= minLongest);
}
