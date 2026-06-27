/**
 * streak-milestone — pure milestone-ladder model for an on-track streak.
 *
 * The dashboard streak tile already nudges toward the seven-day mark (via the
 * local streakHint + lib/streak-tone's daysToStrong). This module generalises
 * that into a full ladder of milestones — a week, two weeks, a month, a season,
 * half a year, a year — so the dashboard can surface "2 days to a week" while a
 * streak is building and a brief "a month reached" the day a milestone lands.
 *
 * It is deliberately distinct from streak-tone (which only owns the strong/warn
 * thresholds and colour) and from the page's inline streakHint (which only knew
 * the single seven-day threshold): this owns the whole ordered ladder and the
 * chip phrasing. No React; everything is derived from the integer streak length.
 */

export interface StreakMilestone {
  /** Streak length in whole days that hits this milestone. */
  days: number;
  /** Human label for the milestone ("a week", "a month"). */
  label: string;
}

/**
 * The milestone ladder in ascending order. Chosen to feel meaningful rather than
 * arbitrary: a week, a fortnight, a month, a quarter, half a year, a full year.
 */
export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { days: 7, label: 'a week' },
  { days: 14, label: 'two weeks' },
  { days: 30, label: 'a month' },
  { days: 90, label: 'three months' },
  { days: 180, label: 'six months' },
  { days: 365, label: 'a year' },
];

/** Coerce a possibly-fractional / non-finite streak into a clamped integer. */
function streakDays(days: number): number {
  return Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
}

/**
 * The next milestone STRICTLY above the current streak, or null once the streak
 * has reached or passed the top of the ladder (nothing left to count toward).
 * A zero streak still points at the first rung (the user is one good day in from
 * the start), so callers that want to stay quiet at zero should gate on the chip
 * helper below rather than this.
 */
export function nextStreakMilestone(days: number): StreakMilestone | null {
  const d = streakDays(days);
  for (const m of STREAK_MILESTONES) {
    if (m.days > d) return m;
  }
  return null;
}

/**
 * Whole days from the current streak to the next milestone, or null when there
 * is no next milestone (already at/over the top rung).
 */
export function daysToNextMilestone(days: number): number | null {
  const next = nextStreakMilestone(days);
  if (!next) return null;
  return next.days - streakDays(days);
}

/**
 * The milestone the streak sits EXACTLY on today (e.g. a 7-day streak just hit
 * "a week"), or null on any other day. Used to flip the chip into a brief
 * celebratory state the day a milestone lands.
 */
export function reachedMilestone(days: number): StreakMilestone | null {
  const d = streakDays(days);
  return STREAK_MILESTONES.find((m) => m.days === d) ?? null;
}

/** The highest milestone the streak has met or passed, or null below the first. */
export function highestMilestoneReached(days: number): StreakMilestone | null {
  const d = streakDays(days);
  let best: StreakMilestone | null = null;
  for (const m of STREAK_MILESTONES) {
    if (d >= m.days) best = m;
    else break;
  }
  return best;
}

export interface StreakMilestoneChip {
  /** Compact label for the chip ("2 days to a week", "a month reached"). */
  label: string;
  /** True the day a milestone exactly lands (celebratory styling). */
  reached: boolean;
  /** Tone the chip maps to a Pill: 'ok' on a landed milestone, else 'accent'. */
  tone: 'ok' | 'accent';
  /** Days remaining to the next milestone, or null on a landed/top streak. */
  remaining: number | null;
}

/**
 * Build the milestone chip model, or null when there is nothing worth showing:
 *   - a zero (or negative/NaN) streak: nothing going yet, no chip
 *   - a streak past the top rung with no exact landing: nothing left to chase
 *
 * Otherwise:
 *   - the day a milestone exactly lands -> "<label> reached" (reached: true, ok)
 *   - while building                    -> "N day(s) to <next label>" (accent)
 *
 * The landing case takes priority so the day a streak turns 7 it celebrates
 * rather than immediately pointing at two weeks.
 */
export function streakMilestoneChip(days: number): StreakMilestoneChip | null {
  const d = streakDays(days);
  if (d <= 0) return null;

  const landed = reachedMilestone(d);
  if (landed) {
    return { label: `${landed.label} reached`, reached: true, tone: 'ok', remaining: 0 };
  }

  const next = nextStreakMilestone(d);
  if (!next) return null; // past the top of the ladder, nothing exact to show

  const remaining = next.days - d;
  return {
    label: `${remaining} day${remaining === 1 ? '' : 's'} to ${next.label}`,
    reached: false,
    tone: 'accent',
    remaining,
  };
}
