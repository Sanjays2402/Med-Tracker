/**
 * milestone-progress — pure "how far between milestones" model for the streak.
 *
 * The dashboard streak capsule already shows a milestone CHIP (lib/streak-
 * milestone) that reads "2 days to a week" / "a month reached". This module adds
 * the thin PROGRESS BAR that sits beneath that chip: it measures how far the
 * current streak has travelled from the last milestone it reached toward the
 * next one, as a clamped 0..1 fraction.
 *
 * It composes streak-milestone's highestMilestoneReached + nextStreakMilestone
 * rather than re-deriving the ladder, so the bar and the chip can never disagree
 * about which rungs bracket the streak. The segment resets at each milestone:
 *   - below the first rung (1..6d)   -> fills from 0 toward "a week"
 *   - just after a milestone lands   -> resets to ~0 and climbs to the next
 *   - at/over the top rung           -> null (nothing above to fill toward)
 *
 * No React, no Date. Everything derives from the integer streak length.
 */

import { highestMilestoneReached, nextStreakMilestone } from './streak-milestone';

/** Coerce a possibly-fractional / non-finite streak into a clamped integer. */
function streakDays(days: number): number {
  return Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
}

/** Clamp a fraction into 0..1 (NaN / negatives become 0). */
function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

export interface MilestoneProgress {
  /** Lower bound of the current segment in days (last reached milestone, or 0). */
  fromDays: number;
  /** Upper bound of the current segment in days (the next milestone). */
  toDays: number;
  /** Human label of the milestone being worked toward ("two weeks"). */
  toLabel: string;
  /** Fraction 0..1 of the way from fromDays to toDays. */
  fraction: number;
  /** Whole percent (0..100) of the way through the segment, for the aria label. */
  pct: number;
  /** Whole days remaining to reach toDays. */
  remaining: number;
}

/**
 * Build the segment-progress model, or null when there is nothing to fill:
 *   - a zero / negative / NaN streak (nothing going yet)
 *   - a streak at or past the top rung (no higher milestone to climb toward)
 *
 * Otherwise the segment spans [last-reached-milestone (or 0) .. next-milestone]
 * and `fraction` is the clamped position of the streak within it. The day a
 * milestone lands the segment resets, so `fraction` reads ~0 while the chip
 * beside it celebrates the milestone just reached.
 */
export function milestoneProgress(days: number): MilestoneProgress | null {
  const d = streakDays(days);
  if (d <= 0) return null;

  const next = nextStreakMilestone(d);
  if (!next) return null; // at/over the top rung — nothing above to fill toward

  const reached = highestMilestoneReached(d);
  const fromDays = reached ? reached.days : 0;
  const span = next.days - fromDays;
  const fraction = span <= 0 ? 0 : clamp01((d - fromDays) / span);

  return {
    fromDays,
    toDays: next.days,
    toLabel: next.label,
    fraction,
    pct: Math.round(fraction * 100),
    remaining: next.days - d,
  };
}

/**
 * Short accessible description of the segment progress, e.g.
 * "60% of the way to two weeks" / "just reached — starting toward a month".
 * Null when there's no segment to describe (mirrors milestoneProgress).
 */
export function milestoneProgressLabel(days: number): string | null {
  const p = milestoneProgress(days);
  if (!p) return null;
  if (p.pct === 0) return `starting toward ${p.toLabel}`;
  return `${p.pct}% of the way to ${p.toLabel}`;
}
