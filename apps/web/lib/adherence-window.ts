/**
 * adherence-window — pure window-option model for the reports adherence bars.
 *
 * The per-medication adherence bar chart gets a 7d / 30d / 90d window picker.
 * This module owns the option list, the chosen-window resolution, and the
 * label/empty-copy helpers so the page stays a thin render and the choices
 * stay unit-tested. The numeric window days feed getMedicationAdherence(window)
 * directly.
 *
 * No React, no Date.now(). The picker is deterministic: a key in always maps to
 * the same window-days out.
 */

export type AdherenceWindowKey = '7d' | '30d' | '90d';

export interface AdherenceWindowOption {
  key: AdherenceWindowKey;
  /** Chip label, e.g. "7 days". */
  label: string;
  /** Short label for tight spots, e.g. "7d". */
  short: string;
  /** Days to request from getMedicationAdherence. */
  days: number;
}

export const ADHERENCE_WINDOWS: AdherenceWindowOption[] = [
  { key: '7d', label: '7 days', short: '7d', days: 7 },
  { key: '30d', label: '30 days', short: '30d', days: 30 },
  { key: '90d', label: '90 days', short: '90d', days: 90 },
];

export const DEFAULT_ADHERENCE_WINDOW: AdherenceWindowKey = '30d';

/** The window keys in display order — handy for keyboard cycling. */
export const WINDOW_KEYS: AdherenceWindowKey[] = ADHERENCE_WINDOWS.map((o) => o.key);

const BY_KEY: Record<AdherenceWindowKey, AdherenceWindowOption> = {
  '7d': ADHERENCE_WINDOWS[0]!,
  '30d': ADHERENCE_WINDOWS[1]!,
  '90d': ADHERENCE_WINDOWS[2]!,
};

/** Resolve a key to its option, falling back to the default for junk input. */
export function resolveWindow(key: string | null | undefined): AdherenceWindowOption {
  if (key && key in BY_KEY) return BY_KEY[key as AdherenceWindowKey];
  return BY_KEY[DEFAULT_ADHERENCE_WINDOW];
}

/** Type guard: is this string one of the known window keys? */
export function isWindowKey(value: unknown): value is AdherenceWindowKey {
  return typeof value === 'string' && value in BY_KEY;
}

/** Days for a window key (the value passed to getMedicationAdherence). */
export function windowDays(key: string | null | undefined): number {
  return resolveWindow(key).days;
}

/**
 * Map a numeric day count back to its window key. Used when migrating a page
 * that stored a raw `7 | 30 | 90` to the shared key model. An exact match wins;
 * anything else falls back to the default so a stray value never throws.
 */
export function windowKeyForDays(days: number | null | undefined): AdherenceWindowKey {
  const hit = ADHERENCE_WINDOWS.find((o) => o.days === days);
  return hit ? hit.key : DEFAULT_ADHERENCE_WINDOW;
}

/**
 * Cycle to the next/previous window key, wrapping at the ends. `dir` of +1 goes
 * 7d -> 30d -> 90d -> 7d; -1 reverses. Lets the picker support Left/Right keys
 * without the caller hand-rolling index math.
 */
export function cycleWindow(key: string | null | undefined, dir: 1 | -1): AdherenceWindowKey {
  const cur = resolveWindow(key).key;
  const i = WINDOW_KEYS.indexOf(cur);
  const next = (i + dir + WINDOW_KEYS.length) % WINDOW_KEYS.length;
  return WINDOW_KEYS[next]!;
}

/** Human caption such as "last 30 days" for the section subhead. */
export function windowCaption(key: string | null | undefined): string {
  return `last ${resolveWindow(key).days} days`;
}

/**
 * Empty-state copy tuned to the window: a 7-day view that is empty is more
 * likely "log a dose" while a 90-day empty view reads "no history yet". Keeps
 * the messaging honest instead of a single generic line.
 */
export function windowEmptyCopy(key: string | null | undefined): string {
  const days = resolveWindow(key).days;
  if (days <= 7) return 'No doses logged in the last 7 days yet. Take a dose and this fills in.';
  if (days <= 30) return 'No per-medication adherence yet. Log a few doses and this fills in.';
  return 'Not enough history for a 90-day view yet. Keep logging and the longer window opens up.';
}
