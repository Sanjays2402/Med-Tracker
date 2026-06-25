/**
 * command-recents — pure recents model for the command palette.
 *
 * When the palette opens with an empty query, the top section shows the few
 * commands/medications the user ran most recently (Raycast/Linear behaviour).
 * This module owns the data shape and the push/dedupe/cap + serialize/parse
 * logic so the palette component stays a thin render and localStorage glue.
 *
 * No React, no direct localStorage access here - the component reads/writes the
 * string; these functions are the pure transforms, fully unit-tested.
 */

export interface RecentEntry {
  /** Stable item id (matches the palette Item id, e.g. "p-meds", "m-<id>"). */
  id: string;
  title: string;
  subtitle?: string;
  /** Where selecting it navigates, when it is a link. */
  href?: string;
  /** Epoch ms it was last run, for ordering + pruning. */
  at: number;
}

export const RECENTS_KEY = 'medtracker.cmdk.recents';
export const RECENTS_MAX = 5;

/**
 * Push an entry to the front of the recents list: newest first, de-duplicated
 * by id (an existing id is moved to the front with its timestamp refreshed),
 * capped at `max`. Returns a new array; never mutates the input.
 */
export function pushRecent(
  list: readonly RecentEntry[],
  entry: RecentEntry,
  max: number = RECENTS_MAX,
): RecentEntry[] {
  if (!entry.id) return [...list];
  const withoutDupe = list.filter((e) => e.id !== entry.id);
  return [entry, ...withoutDupe].slice(0, Math.max(0, max));
}

/** Parse a stored JSON string into a clean, ordered recents list. */
export function parseRecents(raw: string | null | undefined): RecentEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const cleaned: RecentEntry[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) continue;
    if (typeof o.title !== 'string' || !o.title) continue;
    const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0;
    const entry: RecentEntry = { id: o.id, title: o.title, at };
    if (typeof o.subtitle === 'string') entry.subtitle = o.subtitle;
    if (typeof o.href === 'string') entry.href = o.href;
    cleaned.push(entry);
  }
  // Newest first, then cap (defends against a corrupted oversized blob).
  cleaned.sort((a, b) => b.at - a.at);
  return cleaned.slice(0, RECENTS_MAX);
}

export function serializeRecents(list: readonly RecentEntry[]): string {
  return JSON.stringify(list);
}

/**
 * Reconcile stored recents against the items that currently exist in the
 * palette. Entries whose id no longer resolves (e.g. a deleted medication) are
 * dropped, and titles/subtitles/hrefs are refreshed from the live item so a
 * renamed medication shows its new name. Order (recency) is preserved.
 */
export function reconcileRecents(
  list: readonly RecentEntry[],
  liveById: ReadonlyMap<string, { title: string; subtitle?: string; href?: string }>,
): RecentEntry[] {
  const out: RecentEntry[] = [];
  for (const e of list) {
    const live = liveById.get(e.id);
    if (!live) continue;
    const next: RecentEntry = { id: e.id, title: live.title, at: e.at };
    if (live.subtitle !== undefined) next.subtitle = live.subtitle;
    if (live.href !== undefined) next.href = live.href;
    out.push(next);
  }
  return out;
}
