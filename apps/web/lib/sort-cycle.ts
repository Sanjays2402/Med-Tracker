/**
 * sort-cycle — pure "next key in a ring" helper for keyboard sort cycling.
 *
 * The medications list lets a user press "s" to cycle the sort
 * (Name -> Lowest supply -> Soonest refill -> Name), parallel to the reports
 * window picker's Left/Right cycling. This module owns the index math so the
 * page just calls cycleKey(MED_SORT_KEYS, current) on each keypress.
 *
 * Generic over the key union so it stays reusable for any small ordered ring of
 * string keys. A junk / unknown current key resolves to the first ring entry so
 * the first press always lands somewhere sane. No React.
 */

/**
 * The next key in `ring` after `current`, wrapping at the end. `dir` of +1 (the
 * default) advances; -1 steps backward. An unknown / missing current key is
 * treated as "no selection yet": a forward step then lands on the FIRST entry
 * and a backward step on the LAST, so the first press always selects a sane
 * starting option. Returns undefined only for an empty ring.
 */
export function cycleKey<K extends string>(
  ring: readonly K[],
  current: K | null | undefined,
  dir: 1 | -1 = 1,
): K | undefined {
  if (ring.length === 0) return undefined;
  const i = current == null ? -1 : ring.indexOf(current);
  if (i < 0) return dir === 1 ? ring[0] : ring[ring.length - 1];
  const next = (i + dir + ring.length) % ring.length;
  return ring[next];
}

/** The medication sort keys as a plain ordered ring, for keyboard cycling. */
export const MED_SORT_KEYS = ['name', 'supply', 'runout'] as const;
export type MedSortRingKey = (typeof MED_SORT_KEYS)[number];

/**
 * Advance the medications sort to the next key in display order, wrapping
 * Name -> Lowest supply -> Soonest refill -> Name. A junk current key restarts
 * the ring at Name's successor (Lowest supply) on a forward press.
 */
export function cycleMedSort(current: string | null | undefined, dir: 1 | -1 = 1): MedSortRingKey {
  const cur = (MED_SORT_KEYS as readonly string[]).includes(current ?? '')
    ? (current as MedSortRingKey)
    : 'name';
  return cycleKey(MED_SORT_KEYS, cur, dir) ?? 'name';
}
