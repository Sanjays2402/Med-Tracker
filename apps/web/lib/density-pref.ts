/**
 * density-pref — pure row-density model for the /medications list.
 *
 * The medications list gets a Comfortable / Compact density toggle, persisted
 * so the user's choice survives a reload. This module owns the density values,
 * the per-density layout config the rows read, the normalize/parse guards for
 * the stored value, and the toggle transition - so the page stays a thin render
 * and the persistence stays a one-line hook.
 *
 * No React, no direct localStorage access here. The two density values map to a
 * small config: comfortable keeps the schedule subline + supply sparkline and
 * uses roomy padding; compact hides both and tightens the row.
 */

export type Density = 'comfortable' | 'compact';

export const DENSITY_STORAGE_KEY = 'medtracker.medications.density';
export const DEFAULT_DENSITY: Density = 'comfortable';

export interface DensityOption {
  value: Density;
  label: string;
}

export const DENSITY_OPTIONS: DensityOption[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

export interface DensityConfig {
  /** Tailwind padding utility for the row. */
  rowPadding: string;
  /** Show the "schedule, form" subline under the name. */
  showSubline: boolean;
  /** Show the inline supply sparkline. */
  showSparkline: boolean;
  /** Show the thin inline supply bar (mobile-friendly companion to the sparkline). */
  showSupplyBar: boolean;
  /** Also show the inline supply bar at sm+ (comfortable rows have room for runway on desktop). */
  showSupplyBarSmUp: boolean;
  /** Icon tile size in px. */
  iconSize: number;
  /** Name text size utility. */
  nameClass: string;
}

const CONFIG: Record<Density, DensityConfig> = {
  comfortable: {
    rowPadding: 'p-3',
    showSubline: true,
    showSparkline: true,
    showSupplyBar: true,
    showSupplyBarSmUp: true,
    iconSize: 18,
    nameClass: 'text-sm',
  },
  compact: {
    rowPadding: 'px-3 py-1.5',
    showSubline: false,
    showSparkline: false,
    showSupplyBar: false,
    showSupplyBarSmUp: false,
    iconSize: 15,
    nameClass: 'text-[13px]',
  },
};

/** Coerce an arbitrary stored/runtime value into a valid Density. */
export function normalizeDensity(value: unknown): Density {
  return value === 'compact' || value === 'comfortable' ? value : DEFAULT_DENSITY;
}

/** Parse a raw localStorage string (which safeLocalStorage stores as JSON). */
export function parseDensity(raw: string | null | undefined): Density {
  if (!raw) return DEFAULT_DENSITY;
  // Accept both a bare token ("compact") and a JSON-quoted one ('"compact"').
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* not JSON - fall through with the raw string */
  }
  return normalizeDensity(value);
}

/** The layout config for a density (always defined; normalizes first). */
export function densityConfig(value: unknown): DensityConfig {
  return CONFIG[normalizeDensity(value)];
}

/** Flip comfortable <-> compact. */
export function toggleDensity(value: Density): Density {
  return value === 'comfortable' ? 'compact' : 'comfortable';
}

/** The other density's label, for a toggle button that names its destination. */
export function otherDensityLabel(value: Density): string {
  return value === 'comfortable' ? 'Compact' : 'Comfortable';
}
