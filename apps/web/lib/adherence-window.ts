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

/** Days for a window key (the value passed to getMedicationAdherence). */
export function windowDays(key: string | null | undefined): number {
  return resolveWindow(key).days;
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
