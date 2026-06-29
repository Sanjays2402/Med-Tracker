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

/**
 * Self-contained spoken label for the inline supply bar, e.g. "12 days of supply
 * left, healthy". The bar itself is a coloured width a sighted user reads at a
 * glance; this pairs buildSupplyBar's caption with a plain-language word for its
 * tone so a screen-reader user gets the same urgency the colour conveys. Returns
 * null when there's no data (the bar is hidden anyway, nothing to announce).
 * Pure; reuses the SAME tone the bar fills with so the spoken word never
 * disagrees with the picture.
 */
export function supplyBarAriaLabel(bar: SupplyBar): string | null {
  if (!bar.hasData) return null;
  const word =
    bar.tone === 'danger' ? 'low' : bar.tone === 'warn' ? 'getting low' : 'healthy';
  return `${bar.caption}, ${word}`;
}

/**
 * CSS-variable fill colour for a supply tone. Centralises the ok/warn/danger/
 * neutral mapping the inline bar used to ternary in the page, so the inline bar
 * and any future bar/legend agree. Pure; returns a var(--*) string.
 */
export function supplyBarColor(tone: DaysLeftTone): string {
  switch (tone) {
    case 'ok': return 'var(--ok)';
    case 'warn': return 'var(--warn)';
    case 'danger': return 'var(--danger)';
    default: return 'var(--ink-muted)';
  }
}

export interface SupplyLegendEntry {
  tone: Exclude<DaysLeftTone, 'neutral'>;
  /** Short label decoding the colour, e.g. "<7d", "<14d", "14d+". */
  label: string;
  /** CSS var for the swatch. */
  color: string;
}

/**
 * Decode the inline supply-bar colours: three swatches keyed to the SAME bands
 * daysLeftTone uses (danger < 7d, warn < 14d, ok >= 14d), so a one-line key
 * under the list explains the bars instead of leaving the colours unlabelled.
 * The cut points are forwarded from daysLeftTone's defaults so the labels never
 * drift from the bars. Pure; no React.
 */
export function supplyLegend(opts: DaysLeftToneOptions = {}): SupplyLegendEntry[] {
  const danger = opts.dangerBelow ?? DEFAULT_DANGER_BELOW;
  const warn = opts.warnBelow ?? DEFAULT_WARN_BELOW;
  return [
    { tone: 'danger', label: `under ${danger}d`, color: supplyBarColor('danger') },
    { tone: 'warn', label: `under ${warn}d`, color: supplyBarColor('warn') },
    { tone: 'ok', label: `${warn}d+`, color: supplyBarColor('ok') },
  ];
}

export interface SupplyLegendCount extends SupplyLegendEntry {
  /** How many of the supplied meds fall in this band. */
  count: number;
}

/**
 * The supply legend, augmented with how many of `meds` sit in each band — so the
 * key under the list reads "under 7d - 2" and tallies the at-a-glance shape of
 * the pillbox, not just decodes the colours. Only meds with usable supply data
 * are counted (the same ones that draw a bar), via buildSupplyBar so the bands
 * never drift from the bars. A med whose tone is 'neutral' (no data) is skipped.
 *
 * Returns the same three entries as supplyLegend, in the same order, each with a
 * `count`. The cut points forward to both supplyLegend (labels) and daysLeftTone
 * (binning) so labels, bars, and tallies stay in lock-step. Pure; deterministic.
 */
export function supplyLegendCounts(
  meds: readonly Medication[],
  opts: DaysLeftToneOptions = {},
): SupplyLegendCount[] {
  const tally: Record<Exclude<DaysLeftTone, 'neutral'>, number> = { danger: 0, warn: 0, ok: 0 };
  for (const m of meds) {
    const bar = buildSupplyBar(m, opts);
    if (!bar.hasData || bar.tone === 'neutral') continue;
    tally[bar.tone] += 1;
  }
  return supplyLegend(opts).map((e) => ({ ...e, count: tally[e.tone] }));
}

/** A supply band the legend exposes as a filter (the three non-neutral tones). */
export type SupplyBand = Exclude<DaysLeftTone, 'neutral'>;

/**
 * Keep only the meds whose supply falls in `band` (the SAME daysLeftTone band
 * the legend swatch and the inline bars use), so clicking a legend swatch
 * narrows the list to exactly the meds that swatch counts. Meds without usable
 * supply data are dropped (they draw no bar, so they belong to no band). The cut
 * points forward to buildSupplyBar so the filter, the bars, and the legend
 * counts can never disagree. Pure; preserves input order.
 */
export function filterBySupplyBand(
  meds: readonly Medication[],
  band: SupplyBand,
  opts: DaysLeftToneOptions = {},
): Medication[] {
  return meds.filter((m) => {
    const bar = buildSupplyBar(m, opts);
    return bar.hasData && bar.tone === band;
  });
}

/**
 * Human label for an active supply-band filter chip, e.g. "under 7 days",
 * "under 14 days", "14 days or more" — a roomier phrasing than the compact
 * legend label for the active-filter chip / clear control. The cut points
 * forward from daysLeftTone's defaults so the phrasing never drifts from the
 * bands it filters on. Pure.
 */
export function supplyBandLabel(band: SupplyBand, opts: DaysLeftToneOptions = {}): string {
  const danger = opts.dangerBelow ?? DEFAULT_DANGER_BELOW;
  const warn = opts.warnBelow ?? DEFAULT_WARN_BELOW;
  switch (band) {
    case 'danger': return `under ${danger} days`;
    case 'warn': return `under ${warn} days`;
    case 'ok': return `${warn} days or more`;
  }
}

export interface RunoutChip {
  /** Estimated whole days of supply left, or null when unknown. */
  daysLeft: number | null;
  /** Pill tone, sharing daysLeftTone's bands so the list agrees with the hero. */
  tone: DaysLeftTone;
  /** Compact chip label, e.g. "~12d left", or null when there's no supply data. */
  label: string | null;
}

/**
 * Render-ready run-out chip for a medications-LIST row, toned by the SAME
 * daysLeftTone bands the detail-hero supply bar uses — so a med that reads coral
 * on its detail page reads coral in the list, instead of the list's old ad-hoc
 * `< 7 / < 14` thresholds drifting from the hero. The label is the compact
 * "~Nd left" estimate the run-out sort already shows.
 *
 * Returns tone 'neutral' + label null when remainingDoses is unknown (the row
 * falls back to its raw doses-left chip). The two cut points are forwarded to
 * daysLeftTone so a caller can retune without re-deriving the mapping. Pure;
 * deterministic (estimatedDaysLeft is Date-free).
 */
export function runoutChip(med: Medication, opts: DaysLeftToneOptions = {}): RunoutChip {
  const daysLeft = estimatedDaysLeft(med);
  if (daysLeft == null) {
    return { daysLeft: null, tone: 'neutral', label: null };
  }
  return {
    daysLeft,
    tone: daysLeftTone(daysLeft, opts),
    label: `~${daysLeft}d left`,
  };
}

export interface RemainingChipOptions {
  /** Below this many doses the chip is "danger" (coral). Default 10. */
  dangerBelow?: number;
  /** Below this many doses the chip is at least "warn" (amber). Default 20. */
  warnBelow?: number;
}

const DEFAULT_DOSES_DANGER = 10;
const DEFAULT_DOSES_WARN = 20;

export interface RemainingChip {
  /** Remaining doses, or null when unknown. */
  remaining: number | null;
  /** Pill tone for the raw doses-count fallback chip. */
  tone: DaysLeftTone;
  /** Compact chip label, e.g. "8 left", or null when there's no count. */
  label: string | null;
}

/**
 * Render-ready chip for the medications-LIST fallback "N left" pill — the row
 * that has a doses COUNT but isn't run-out-sorted (so it can't show the
 * "~Nd left" estimate). It tones by remaining doses on the same calm bands the
 * run-out chip uses for days, so a low-stock med reads coral and a healthy one
 * neutral, instead of an untoned grey count. Bands are [..10) danger, [10..20)
 * warn, [20..) ok; exactly the cut point reads the calmer band. Returns
 * tone 'neutral' + null label when remaining is unknown (no chip). The two cut
 * points are overridable. Pure; deterministic.
 */
export function remainingChip(
  remaining: number | null | undefined,
  opts: RemainingChipOptions = {},
): RemainingChip {
  if (remaining == null || !Number.isFinite(remaining)) {
    return { remaining: null, tone: 'neutral', label: null };
  }
  const danger = opts.dangerBelow ?? DEFAULT_DOSES_DANGER;
  const warn = opts.warnBelow ?? DEFAULT_DOSES_WARN;
  const tone: DaysLeftTone =
    remaining < danger ? 'danger' : remaining < warn ? 'warn' : 'ok';
  return { remaining, tone, label: `${remaining} left` };
}
