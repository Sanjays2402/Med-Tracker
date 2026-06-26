/**
 * month-density — pure dose-density dot model for the /schedule/month cells.
 *
 * Each busy month cell shows up to a few medication-name chips and, when more
 * dose entries land on that day than fit, a "+N more" footer. This module turns
 * a day's dose count into a compact row of density dots (one dot per dose, up to
 * a cap, with an overflow flag) plus a load tone, so a glance reads "how busy is
 * this day" without parsing a number. Parallels the heatmap intensity idea but
 * for a single calendar cell.
 *
 * The dot count never exceeds `maxDots` (default 5); past the cap the row marks
 * `overflow` so the cell can render a trailing "+" affordance. The load tone
 * buckets the raw count: light (1-2) / steady (3-4) / busy (5-6) / heavy (7+).
 * No React, no Date.now().
 */

export type DayLoad = 'none' | 'light' | 'steady' | 'busy' | 'heavy';

export interface DensityDots {
  /** Raw dose count for the day. */
  count: number;
  /** Number of dots to render (min(count, maxDots)). */
  dots: number;
  /** True when count exceeds the dot cap (render a trailing "+"). */
  overflow: boolean;
  /** Doses beyond the cap (0 when not overflowing). */
  overflowCount: number;
  load: DayLoad;
}

export interface DensityOptions {
  /** Max dots rendered before the row overflows. Default 5. */
  maxDots?: number;
}

const DEFAULT_MAX_DOTS = 5;

/** Bucket a raw dose count into a load tier. */
export function dayLoad(count: number): DayLoad {
  if (count <= 0) return 'none';
  if (count <= 2) return 'light';
  if (count <= 4) return 'steady';
  if (count <= 6) return 'busy';
  return 'heavy';
}

/** CSS var for a load tone (sage ramps up, coral for a heavy day). */
export const LOAD_TONE_VAR: Record<DayLoad, string> = {
  none: 'var(--ink-muted)',
  light: 'var(--accent-soft)',
  steady: 'var(--accent)',
  busy: 'var(--warn)',
  heavy: 'var(--danger)',
};

/**
 * Build the density-dot model for a day's dose count. Negative / NaN counts
 * clamp to 0 (a "none" day with no dots). The dot count is capped at maxDots
 * and the remainder is surfaced via overflow / overflowCount.
 */
export function densityDots(count: number, opts: DensityOptions = {}): DensityDots {
  const cap = Math.max(1, Math.floor(opts.maxDots ?? DEFAULT_MAX_DOTS));
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const dots = Math.min(n, cap);
  const overflowCount = Math.max(0, n - cap);
  return {
    count: n,
    dots,
    overflow: overflowCount > 0,
    overflowCount,
    load: dayLoad(n),
  };
}

/** Convenience: the density model straight from a day's medication-name list. */
export function densityForNames(names: readonly string[] | undefined, opts: DensityOptions = {}): DensityDots {
  return densityDots(names?.length ?? 0, opts);
}
