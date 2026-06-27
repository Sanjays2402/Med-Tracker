/**
 * streak-tone — pure tone classifier for an on-track streak length.
 *
 * Both the dashboard streak tile/capsule and the history streak callout want to
 * colour a streak by how established it is: a week-plus run reads "strong"
 * (sage), a day-to-six-day run reads "building" (amber), and a zero-day streak
 * is neutral. This module owns the thresholds and the tone mapping so the two
 * surfaces agree and the page stays a thin render.
 *
 * The tone vocabulary ('ok' | 'warn' | 'neutral') maps straight onto the
 * StatTile accent and the Pill tone the components already use. No React.
 */

export type StreakTone = 'ok' | 'warn' | 'neutral';

/** A streak of this many days or more counts as established (sage). Default 7. */
export const STREAK_STRONG_DAYS = 7;

export interface StreakToneOptions {
  /** Days at/above which the streak is "strong". Default 7. */
  strongAt?: number;
}

/**
 * Classify a streak length into a tone:
 *   - 0 (or negative/NaN) -> neutral (nothing going yet)
 *   - 1..(strongAt-1)     -> warn  (building, keep it up)
 *   - strongAt+           -> ok    (established run)
 */
export function streakTone(days: number, opts: StreakToneOptions = {}): StreakTone {
  const strongAt = opts.strongAt ?? STREAK_STRONG_DAYS;
  const d = Number.isFinite(days) ? Math.floor(days) : 0;
  if (d <= 0) return 'neutral';
  return d >= strongAt ? 'ok' : 'warn';
}

/**
 * The StatTile `accent` value for a streak: undefined when neutral (the tile
 * shows its default sage dot, which shouldn't shout for a 0-day streak), else
 * the tone. Kept as a helper so the tile doesn't branch inline.
 */
export function streakAccent(days: number, opts: StreakToneOptions = {}): 'ok' | 'warn' | undefined {
  const tone = streakTone(days, opts);
  return tone === 'neutral' ? undefined : tone;
}

/** CSS custom-property the tone maps to, for inline ring / capsule colouring. */
export function streakToneVar(days: number, opts: StreakToneOptions = {}): string {
  switch (streakTone(days, opts)) {
    case 'ok': return 'var(--ok)';
    case 'warn': return 'var(--warn)';
    default: return 'var(--ink-muted)';
  }
}

/**
 * Whole days until the next milestone (the strong threshold), or 0 once the
 * streak is already established. Lets the UI nudge "2 days to a week". Returns
 * null for a zero/negative streak (nothing to count toward yet).
 */
export function daysToStrong(days: number, opts: StreakToneOptions = {}): number | null {
  const strongAt = opts.strongAt ?? STREAK_STRONG_DAYS;
  const d = Number.isFinite(days) ? Math.floor(days) : 0;
  if (d <= 0) return null;
  return d >= strongAt ? 0 : strongAt - d;
}
