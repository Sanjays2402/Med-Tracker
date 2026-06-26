/**
 * history-streak — pure trailing/longest on-track streak counter for /history.
 *
 * The history heatmap renders one square per day with an adherence percentage.
 * This module turns that same day series into a "current streak: N days"
 * callout: it counts how many of the most recent days were on-track, plus the
 * longest such run in the window, so the page renders a callout from a
 * deterministic model instead of recomputing inline.
 *
 * "On track" means the day's adherence percent meets a threshold (default 70,
 * the heatmap's "mixed or better" band). Future days are ignored. The current
 * streak counts backward from the most recent non-future day and stops at the
 * first day below threshold. No React, no Date.now().
 */

export interface StreakDay {
  /** Whole-percent adherence for the day (0..100). */
  pct: number;
  /** Future days carry no data and are skipped entirely. */
  isFuture?: boolean;
  /** Optional ISO day key, surfaced as the streak's start when present. */
  iso?: string;
}

export interface StreakOptions {
  /** A day counts toward a streak when pct >= this. Default 70. */
  onTrackThreshold?: number;
}

const DEFAULT_THRESHOLD = 70;

function isOnTrack(day: StreakDay, threshold: number): boolean {
  return !day.isFuture && Number.isFinite(day.pct) && day.pct >= threshold;
}

/** Past (non-future) days only, in input (chronological) order. */
function pastDays(days: readonly StreakDay[]): StreakDay[] {
  return days.filter((d) => !d.isFuture);
}

/**
 * Count consecutive on-track days ending at the most recent past day. Returns 0
 * when the latest past day is below threshold (the streak is already broken).
 */
export function currentStreak(days: readonly StreakDay[], opts: StreakOptions = {}): number {
  const threshold = opts.onTrackThreshold ?? DEFAULT_THRESHOLD;
  const past = pastDays(days);
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (isOnTrack(past[i]!, threshold)) streak++;
    else break;
  }
  return streak;
}

/** The longest run of consecutive on-track days anywhere in the window. */
export function longestStreak(days: readonly StreakDay[], opts: StreakOptions = {}): number {
  const threshold = opts.onTrackThreshold ?? DEFAULT_THRESHOLD;
  let best = 0;
  let run = 0;
  for (const day of pastDays(days)) {
    if (isOnTrack(day, threshold)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export interface StreakSummary {
  current: number;
  longest: number;
  threshold: number;
  /** ISO key of the first day in the current streak, or null when none/absent. */
  startIso: string | null;
  /** True when the current streak equals the longest (a personal best run). */
  isBest: boolean;
  /** Tone hint: a healthy current streak is ok, a broken one neutral. */
  tone: 'ok' | 'neutral';
}

/**
 * Roll the day series into a callout-ready summary: current trailing streak,
 * longest run, and the ISO day the current streak began. `isBest` is true when
 * the current streak ties or beats every other run (and is non-zero), so the UI
 * can celebrate a personal best.
 */
export function summarizeStreak(days: readonly StreakDay[], opts: StreakOptions = {}): StreakSummary {
  const threshold = opts.onTrackThreshold ?? DEFAULT_THRESHOLD;
  const current = currentStreak(days, opts);
  const longest = longestStreak(days, opts);
  const past = pastDays(days);
  const startIso = current > 0 ? (past[past.length - current]?.iso ?? null) : null;
  return {
    current,
    longest,
    threshold,
    startIso,
    isBest: current > 0 && current >= longest,
    tone: current > 0 ? 'ok' : 'neutral',
  };
}
