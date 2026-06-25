/**
 * bottle-fill — pure fill math for the refill "pill bottle" gauge.
 *
 * A refill row renders a little vertical bottle that fills proportional to the
 * supply remaining. This module computes the fill fraction and the tone (sage
 * when healthy, coral once at/under the refill threshold, empty when out) so
 * the SVG component stays dumb and the thresholds stay unit-tested.
 *
 * Units are caller-defined but must be CONSISTENT: pass remaining, capacity,
 * and lowAt all in days-of-supply, or all in doses. The refills page uses
 * days-of-supply remaining (capped at the fill's daysSupply) with the
 * medication's refillThresholdDays as the low-water mark.
 */

export type BottleTone = 'ok' | 'low' | 'empty';

export interface BottleFill {
  /** Clamped 0..1 fill fraction for the liquid height. */
  fraction: number;
  /** Rounded 0..100 percentage, for labels / aria. */
  percent: number;
  tone: BottleTone;
  /** True once remaining is at or below the low-water threshold. */
  belowThreshold: boolean;
  /** Echoed back, clamped to [0, capacity]. */
  remaining: number;
  /** Effective capacity used (never below remaining or 1). */
  capacity: number;
}

export interface BottleFillOptions {
  /**
   * Low-water threshold in the same unit as remaining/capacity. At or below
   * this, the bottle turns coral. Defaults to 20% of the effective capacity.
   */
  lowAt?: number;
}

export function computeBottleFill(
  remaining: number,
  capacity: number,
  opts: BottleFillOptions = {},
): BottleFill {
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  // Capacity can never be below what's left (no overflowing bottles) or below 1.
  const cap = Math.max(Number.isFinite(capacity) ? capacity : 0, safeRemaining, 1);
  const clampedRemaining = Math.min(safeRemaining, cap);
  const fraction = clampedRemaining / cap;

  const lowAt = opts.lowAt ?? cap * 0.2;
  const belowThreshold = clampedRemaining <= lowAt;

  let tone: BottleTone;
  if (clampedRemaining <= 0) tone = 'empty';
  else if (belowThreshold) tone = 'low';
  else tone = 'ok';

  return {
    fraction,
    percent: Math.round(fraction * 100),
    tone,
    belowThreshold,
    remaining: clampedRemaining,
    capacity: cap,
  };
}

/** Map a bottle tone to the app's semantic CSS custom-property names. */
export function bottleToneVars(tone: BottleTone): { liquid: string; soft: string } {
  switch (tone) {
    case 'ok':    return { liquid: 'var(--accent)', soft: 'var(--accent-soft)' };
    case 'low':   return { liquid: 'var(--danger)', soft: 'var(--danger-bg)' };
    case 'empty': return { liquid: 'var(--ink-muted)', soft: 'var(--bg-sunk)' };
  }
}
