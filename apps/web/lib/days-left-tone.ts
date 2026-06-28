/**
 * days-left-tone — pure tone classifier for "days of supply remaining", plus the
 * supply-bar model the medication detail hero uses.
 *
 * Several surfaces read a single "days left" number and want it to carry its own
 * urgency: a med that runs out this week is coral, one that runs out within a
 * fortnight is amber, anything healthier is sage. This module owns those
 * thresholds + the tone -> CSS-variable mapping so the detail hero supply bar and
 * any future consumer agree and stay a thin render.
 *
 * Thresholds:
 *   days <  7  -> danger (coral)   runs out this week
 *   days < 14  -> warn   (amber)   runs out within a fortnight
 *   days >= 14 -> ok     (sage)    comfortable
 *   unknown    -> neutral          no supply data to colour
 *
 * The supply bar fills proportional to days-left across a fixed horizon (default
 * 30 days) so a fuller bar means more runway and bars are visually comparable
 * between meds. No React; deterministic (estimatedDaysLeft is Date-free).
 */

import type { Medication } from './types';
import { estimatedDaysLeft } from './medication-sort';

export type DaysLeftTone = 'ok' | 'warn' | 'danger' | 'neutral';

export interface DaysLeftToneOptions {
  /** Below this many days the supply is "danger" (coral). Default 7. */
  dangerBelow?: number;
  /** Below this many days the supply is at least "warn" (amber). Default 14. */
  warnBelow?: number;
}

const DEFAULT_DANGER_BELOW = 7;
const DEFAULT_WARN_BELOW = 14;

/**
 * Classify days-of-supply-left into a tone:
 *   - null / non-finite -> neutral (no data to colour)
 *   - < dangerBelow (7) -> danger
 *   - < warnBelow  (14) -> warn
 *   - otherwise         -> ok
 *
 * A value of exactly the threshold reads as the calmer band (7 days is warn, not
 * danger; 14 days is ok, not warn) so the bands are [..7) danger, [7..14) warn,
 * [14..) ok. The two cut points are overridable so a caller can retune without
 * re-deriving the mapping.
 */
export function daysLeftTone(
  daysLeft: number | null | undefined,
  opts: DaysLeftToneOptions = {},
): DaysLeftTone {
  if (daysLeft == null || !Number.isFinite(daysLeft)) return 'neutral';
  const dangerBelow = opts.dangerBelow ?? DEFAULT_DANGER_BELOW;
  const warnBelow = opts.warnBelow ?? DEFAULT_WARN_BELOW;
  if (daysLeft < dangerBelow) return 'danger';
  if (daysLeft < warnBelow) return 'warn';
  return 'ok';
}

/** CSS custom-property the tone maps to, for inline fill / text colouring. */
export function daysLeftToneVar(
  daysLeft: number | null | undefined,
  opts: DaysLeftToneOptions = {},
): string {
  switch (daysLeftTone(daysLeft, opts)) {
    case 'ok': return 'var(--ok)';
    case 'warn': return 'var(--warn)';
    case 'danger': return 'var(--danger)';
    default: return 'var(--ink-muted)';
  }
}

export interface SupplyBar {
  /** Estimated whole days of supply left, or null when unknown. */
  daysLeft: number | null;
  /** Bar fill as a whole 0..100 percent of the horizon. 0 when unknown. */
  pct: number;
  /** Tone the bar fill + caption map to a colour. */
  tone: DaysLeftTone;
  /** True when there is usable supply data to draw a filled bar. */
  hasData: boolean;
  /** Compact caption, e.g. "12 days of supply left", or "No supply data". */
  caption: string;
  /** The horizon (in days) the fill is measured against. */
  horizonDays: number;
}

export interface SupplyBarOptions extends DaysLeftToneOptions {
  /** Days that map to a full bar. Default 30. */
  horizonDays?: number;
}

const DEFAULT_HORIZON = 30;

/** Compact caption for the bar, pluralising the day count. */
function supplyCaption(daysLeft: number | null): string {
  if (daysLeft == null) return 'No supply data';
  if (daysLeft <= 0) return 'Out of supply';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} of supply left`;
}

/**
 * Build the supply-bar model for a medication. The fill is days-left as a
 * fraction of `horizonDays`, clamped to 0..100, so a med with a full month or
 * more of supply pegs the bar at 100% and a near-empty one barely fills. When
 * remainingDoses is unknown the bar reports hasData=false with a 0% neutral
 * fill so the hero can show a muted "No supply data" track instead of a
 * misleading empty-but-coloured bar. Pure; deterministic.
 */
export function buildSupplyBar(med: Medication, opts: SupplyBarOptions = {}): SupplyBar {
  const horizonDays = Math.max(1, Math.floor(opts.horizonDays ?? DEFAULT_HORIZON));
  const daysLeft = estimatedDaysLeft(med);
  if (daysLeft == null) {
    return { daysLeft: null, pct: 0, tone: 'neutral', hasData: false, caption: supplyCaption(null), horizonDays };
  }
  const pct = Math.max(0, Math.min(100, Math.round((daysLeft / horizonDays) * 100)));
  return {
    daysLeft,
    pct,
    tone: daysLeftTone(daysLeft, opts),
    hasData: true,
    caption: supplyCaption(daysLeft),
    horizonDays,
  };
}
