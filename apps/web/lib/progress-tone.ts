/**
 * progress-tone — pure tone classifier for a 0..100 completion percentage.
 *
 * Several surfaces lead with a single progress number (the /today day-percent
 * prefix, the dashboard "today" chip) and want that number to read its own
 * health at a glance: low progress is coral, mid is amber, near-done is sage.
 * This module owns the thirds thresholds and the tone -> CSS-variable mapping so
 * those surfaces agree and stay a thin render.
 *
 * Thresholds (thirds):
 *   0..33   -> danger (coral)   barely started
 *   34..66  -> warn   (amber)   underway
 *   67..100 -> ok     (sage)    nearly there / done
 *
 * The vocabulary ('ok' | 'warn' | 'danger') maps straight onto the Pill tone and
 * the capsule classes the components already use. No React; deterministic.
 */

export type ProgressTone = 'ok' | 'warn' | 'danger';

export interface ProgressToneOptions {
  /** At/above this percent the progress is "ok" (sage). Default 67. */
  okAt?: number;
  /** At/above this percent the progress is at least "warn" (amber). Default 34. */
  warnAt?: number;
}

const DEFAULT_OK_AT = 67;
const DEFAULT_WARN_AT = 34;

/** Clamp + floor an arbitrary number into a whole 0..100 percent. */
function clampPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.floor(pct)));
}

/**
 * Classify a completion percentage into a tone using the thirds thresholds:
 *   - >= okAt   (default 67) -> ok    (sage, nearly there)
 *   - >= warnAt (default 34) -> warn  (amber, underway)
 *   - otherwise              -> danger(coral, barely started)
 *
 * Non-finite input is treated as 0 (danger). The two cut points are overridable
 * so a caller can retune the bands without re-deriving the mapping.
 */
export function progressTone(pct: number, opts: ProgressToneOptions = {}): ProgressTone {
  const okAt = opts.okAt ?? DEFAULT_OK_AT;
  const warnAt = opts.warnAt ?? DEFAULT_WARN_AT;
  const p = clampPercent(pct);
  if (p >= okAt) return 'ok';
  if (p >= warnAt) return 'warn';
  return 'danger';
}

/** CSS custom-property the tone maps to, for inline text / fill colouring. */
export function progressToneVar(pct: number, opts: ProgressToneOptions = {}): string {
  switch (progressTone(pct, opts)) {
    case 'ok': return 'var(--ok)';
    case 'warn': return 'var(--warn)';
    default: return 'var(--danger)';
  }
}
