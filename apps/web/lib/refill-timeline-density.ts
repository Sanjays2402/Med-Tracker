/**
 * refill-timeline-density — pure compact/comfortable height model + persistence
 * guard for the /refills timeline strip.
 *
 * A long refill list lets the timeline marks stack into many lanes; on a tall
 * page that pushes everything down. A density toggle lets the user trade label
 * breathing-room for height: comfortable keeps the roomy 30px lane spacing, compact
 * tightens it to 20px so a busy strip fits in less vertical space. The choice is a
 * per-user preference that survives a reload, exactly like the medications row
 * density (lib/density-pref) and the caregivers health bar (lib/expiry-bar-pref).
 *
 * This module owns the two density values, their lane-spacing config, and the
 * normalize/parse/serialize guards so the strip stays a thin render and the
 * persistence stays a one-line hook. No React, no direct localStorage access.
 */

export type StripDensity = 'comfortable' | 'compact';

export const STRIP_DENSITY_STORAGE_KEY = 'medtracker.refills.timelineDensity';
export const DEFAULT_STRIP_DENSITY: StripDensity = 'comfortable';

export interface StripDensityOption {
  value: StripDensity;
  label: string;
}

export const STRIP_DENSITY_OPTIONS: StripDensityOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

export interface StripDensityConfig {
  /** Vertical pixels between stacked lanes. */
  laneSpacing: number;
  /** Top offset of the first lane, in px. */
  laneTop: number;
  /** Base track padding (whitespace below the marks before legend), in px. */
  trackPad: number;
}

const CONFIG: Record<StripDensity, StripDensityConfig> = {
  comfortable: { laneSpacing: 30, laneTop: 10, trackPad: 14 },
  compact: { laneSpacing: 20, laneTop: 7, trackPad: 10 },
};

/** Coerce an arbitrary stored/runtime value into a valid StripDensity. */
export function normalizeStripDensity(value: unknown): StripDensity {
  return value === 'compact' || value === 'comfortable' ? value : DEFAULT_STRIP_DENSITY;
}

/** Parse a raw localStorage string (which safeLocalStorage stores as JSON). */
export function parseStripDensity(raw: string | null | undefined): StripDensity {
  if (!raw) return DEFAULT_STRIP_DENSITY;
  // Accept both a bare token ("compact") and a JSON-quoted one ('"compact"').
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeStripDensity(value);
}

/** Serialise the density for localStorage (mirrors the other prefs). */
export function serializeStripDensity(value: StripDensity): string {
  return JSON.stringify(value);
}

/** The lane-spacing config for a density (always defined; normalizes first). */
export function stripDensityConfig(value: unknown): StripDensityConfig {
  return CONFIG[normalizeStripDensity(value)];
}

/** Flip comfortable <-> compact. */
export function toggleStripDensity(value: StripDensity): StripDensity {
  return value === 'comfortable' ? 'compact' : 'comfortable';
}

/** The other density's label, for a toggle button that names its destination. */
export function otherStripDensityLabel(value: StripDensity): string {
  return value === 'comfortable' ? 'Compact' : 'Comfortable';
}

/**
 * Total track height for a strip with `laneCount` lanes at the given density:
 * trackPad + laneCount * laneSpacing. The strip computes its own laneCount from
 * the marks; keeping the formula here means compact and comfortable always agree
 * on the per-lane delta. Always at least one lane is reserved. Pure.
 */
export function trackHeight(laneCount: number, value: unknown): number {
  const cfg = stripDensityConfig(value);
  const lanes = Math.max(1, Number.isFinite(laneCount) ? Math.floor(laneCount) : 1);
  return cfg.trackPad + lanes * cfg.laneSpacing;
}
