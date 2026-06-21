/**
 * Adherence streak rescue.
 *
 * Streaks are the strongest visible reward in a medication-tracking app,
 * but a single missed or late dose can break a long run if the UI just
 * silently resets the counter at midnight. That's a bad outcome twice
 * over: the streak was a real behavioral asset, and giving up on it
 * after one slip often leads to dropping further adherence.
 *
 * `evaluateStreakRescue` looks at the recent dose log and decides whether
 * the streak is in active danger and what action could still save it:
 *
 *   - `safe`: today's doses are all accounted for, streak intact.
 *   - `at-risk`: at least one dose due today is still scheduled and the
 *     deadline (end-of-day + grace) is approaching.
 *   - `grace-take`: a dose is past due but still inside the configured
 *     grace window; taking it now preserves the streak.
 *   - `makeup-available`: the streak would break, but a makeup window
 *     allows a single late dose tomorrow to count for both days.
 *   - `broken`: the streak has irrecoverably reset.
 *
 * Pure / deterministic. Operates on the same `DoseLike` shape `streak.ts`
 * already uses.
 */

import type { DoseLike } from './streak';
import { addDays, startOfDay } from './date';

export type StreakRescueStatus = 'safe' | 'at-risk' | 'grace-take' | 'makeup-available' | 'broken';

export interface StreakRescueInput {
  doses: DoseLike[];
  /** Reference "now". Defaults to new Date(). */
  now?: Date;
  /**
   * Minutes after midnight the prior day still counts (the grace window).
   * E.g. 120 means until 02:00 next morning a late dose still saves the
   * streak. Default 60.
   */
  graceMinutes?: number;
  /**
   * If true, allow a single makeup dose tomorrow to retroactively save a
   * broken-yesterday streak. Default true. Disable for stricter clinical
   * regimens (e.g. controlled substances).
   */
  allowMakeup?: boolean;
}

export interface StreakRescuePlan {
  status: StreakRescueStatus;
  /** Current streak before any rescue action. */
  currentStreak: number;
  /** Number of doses still due today. */
  remainingToday: number;
  /** Deadline (ISO) to take the dose and stay safe. */
  rescueDeadline?: string;
  /** Minutes from `now` to rescueDeadline. */
  minutesUntilDeadline?: number;
  /** Human-friendly action prompt for the UI. */
  action: string;
}

function withinDay(d: DoseLike, day: Date): boolean {
  const t = new Date(d.dueAt).getTime();
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();
  return t >= start && t < end;
}

function countTakenDay(doses: DoseLike[], day: Date): number {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();
  let c = 0;
  for (const d of doses) {
    if (!d.takenAt) continue;
    const t = new Date(d.takenAt).getTime();
    if (t >= start && t < end) c += 1;
  }
  return c;
}

function streakAsOf(doses: DoseLike[], asOf: Date): number {
  // Walk back day by day: a day counts if it had at least one taken dose.
  let cursor = startOfDay(asOf);
  let n = 0;
  while (countTakenDay(doses, cursor) > 0) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// Keep streakAsOf exported as a small helper so other utils can reuse it.
export { streakAsOf as streakDaysAsOf };

export function evaluateStreakRescue(input: StreakRescueInput): StreakRescuePlan {
  const now = input.now ?? new Date();
  const grace = input.graceMinutes ?? 60;
  const allowMakeup = input.allowMakeup ?? true;

  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  // Streak right now (counts today only if today already has a take).
  function countStreakBack(from: Date): number {
    let cur = from;
    let n = 0;
    while (countTakenDay(input.doses, cur) > 0) {
      n += 1;
      cur = addDays(cur, -1);
    }
    return n;
  }
  const baseStreak = countStreakBack(today);
  const yesterdayHad = countTakenDay(input.doses, yesterday) > 0;
  const todayHad = countTakenDay(input.doses, today) > 0;

  const dueToday = input.doses.filter((d) => withinDay(d, today));
  const remainingToday = dueToday.filter((d) => !d.takenAt && new Date(d.dueAt).getTime() <= addDays(today, 1).getTime()).length;

  // 1) safe: today already has at least one take and no remaining due doses.
  if (todayHad && remainingToday === 0) {
    return {
      status: 'safe',
      currentStreak: baseStreak,
      remainingToday: 0,
      action: 'Streak intact for today.',
    };
  }

  // 2) at-risk: doses still due today, time until end-of-day + grace.
  if (remainingToday > 0) {
    const deadline = new Date(addDays(today, 1).getTime() + grace * 60_000);
    const mins = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 60_000));
    return {
      status: 'at-risk',
      currentStreak: baseStreak,
      remainingToday,
      rescueDeadline: deadline.toISOString(),
      minutesUntilDeadline: mins,
      action: `Take ${remainingToday} more dose${remainingToday === 1 ? '' : 's'} today to extend the ${baseStreak}-day streak.`,
    };
  }

  // No remaining-today doses but today also has no take. Either the
  // patient already passed end-of-day with no doses, or today simply has
  // no scheduled doses (PRN day).
  if (!todayHad) {
    // grace-take: within grace window after midnight, yesterday had a
    // taken dose and yesterday had additional missed doses that could
    // still count. We treat any dose with dueAt within last 24h not yet
    // taken as a possible grace target.
    const graceUntil = new Date(today.getTime() + grace * 60_000);
    const inGracePeriod = now.getTime() < graceUntil.getTime();
    const yesterdayMissable = input.doses.find(
      (d) => !d.takenAt && withinDay(d, yesterday),
    );
    if (inGracePeriod && yesterdayMissable && yesterdayHad) {
      const mins = Math.max(0, Math.ceil((graceUntil.getTime() - now.getTime()) / 60_000));
      return {
        status: 'grace-take',
        currentStreak: baseStreak,
        remainingToday: 0,
        rescueDeadline: graceUntil.toISOString(),
        minutesUntilDeadline: mins,
        action: `Within grace period; take the missed dose to preserve the ${baseStreak}-day streak.`,
      };
    }
    if (inGracePeriod && yesterdayHad && !yesterdayMissable) {
      // grace window open but no missable dose — yesterday is fine, just
      // need to take today's first dose; treat as safe pending.
      return {
        status: 'safe',
        currentStreak: baseStreak,
        remainingToday: 0,
        action: 'Streak intact through yesterday; await today\'s first dose.',
      };
    }

    // makeup-available: yesterday broke, today not yet logged but allowed
    // a single makeup dose by end of tomorrow.
    if (allowMakeup && !yesterdayHad && baseStreak === 0) {
      // Compute the "lost" streak by checking the day before yesterday.
      const dayBefore = addDays(yesterday, -1);
      const priorStreak = countStreakBack(dayBefore);
      if (priorStreak > 0) {
        const deadline = new Date(addDays(tomorrow, 1).getTime() - 1);
        const mins = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 60_000));
        return {
          status: 'makeup-available',
          currentStreak: priorStreak,
          remainingToday: 0,
          rescueDeadline: deadline.toISOString(),
          minutesUntilDeadline: mins,
          action: `Take a makeup dose by end of tomorrow to retroactively restore the ${priorStreak}-day streak.`,
        };
      }
    }

    // Otherwise streak is broken.
    return {
      status: 'broken',
      currentStreak: 0,
      remainingToday: 0,
      action: 'Streak reset; start a new run with today\'s next dose.',
    };
  }

  // todayHad but remainingToday == 0 already handled above; default safety.
  return {
    status: 'safe',
    currentStreak: baseStreak,
    remainingToday: 0,
    action: 'Streak intact for today.',
  };
}
