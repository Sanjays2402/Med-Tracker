/**
 * Fast pairwise interaction severity lookup with memoisation.
 *
 * `classifyInteractions` walks an N-drug list once and returns every
 * interacting pair. The dashboard and the "add medication" wizard need
 * the inverse: given the patient's active drugs, what would happen
 * if drug X were added (or two arbitrary drugs were combined)?
 *
 * Naively that's another full `classifyInteractions` run per query. A
 * patient with 15 active meds plus a 200-row search catalog blows past
 * a thousand pair evaluations per keystroke.
 *
 * This module precomputes once per active-list and exposes:
 *
 *   - `buildPairSearchIndex(active)` -> `PairSearchIndex` containing
 *     every pair's severity in a normalized id-pair map, plus a fast
 *     per-id reverse-index of "drugs this one interacts with."
 *   - `searchPair(index, drugA, drugB)` -> the highest-severity
 *     ScoredInteraction the two would produce, including pairs not
 *     yet in the active list (caller passes the candidate Drug).
 *   - `searchAgainstActive(index, candidate)` -> every interaction
 *     `candidate` would create against the active list, sorted.
 *
 * Pure / deterministic and re-uses SEVERITY_RULES / classifyInteractions
 * so behaviour stays in lockstep with the canonical classifier.
 */

import type { Drug, Interaction } from '@med/types';
import {
  classifyInteractions,
  type ScoredInteraction,
  type SeverityLevel,
} from './interaction-severity';

export interface PairSearchIndex {
  /** Active drugs in the patient's regimen. */
  readonly active: Drug[];
  /** active.id -> Drug for O(1) lookup. */
  readonly activeById: Map<string, Drug>;
  /**
   * Map keyed by `sortedId(a) + '|' + sortedId(b)` -> the scored
   * interaction between two ACTIVE drugs. Built once at index time.
   */
  readonly pairs: Map<string, ScoredInteraction>;
  /** activeId -> set of other activeIds that interact with it. */
  readonly neighbors: Map<string, Set<string>>;
  /** Number of pair evaluations cached so far (for telemetry). */
  cachedQueries: number;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

/**
 * Build an index over the active drug list. Runs `classifyInteractions`
 * exactly once. Subsequent searches inside the active set are O(1).
 */
export function buildPairSearchIndex(active: Drug[]): PairSearchIndex {
  const activeById = new Map<string, Drug>();
  for (const d of active) activeById.set(d.id, d);

  const pairs = new Map<string, ScoredInteraction>();
  const neighbors = new Map<string, Set<string>>();

  // Initialise empty neighbor sets so callers can iterate without nulls.
  for (const d of active) neighbors.set(d.id, new Set());

  const all = classifyInteractions(active);
  // classifyInteractions returns `a` / `b` as generic names, not ids.
  // We need a stable lookup back to ids; build a generic->id table.
  // If two active drugs share a generic name (rare but possible with
  // brand vs generic listings), prefer the first occurrence.
  const idByGeneric = new Map<string, string>();
  for (const d of active) {
    if (!idByGeneric.has(d.generic.toLowerCase())) {
      idByGeneric.set(d.generic.toLowerCase(), d.id);
    }
  }

  for (const inter of all) {
    const aid = idByGeneric.get(inter.a.toLowerCase());
    const bid = idByGeneric.get(inter.b.toLowerCase());
    if (!aid || !bid) continue;
    pairs.set(pairKey(aid, bid), inter);
    neighbors.get(aid)!.add(bid);
    neighbors.get(bid)!.add(aid);
  }

  return { active, activeById, pairs, neighbors, cachedQueries: 0 };
}

/**
 * Look up the severity of a pair. Both drugs are accepted as `Drug`
 * objects so callers can query candidates that are NOT yet in the
 * active list (the search-result row of the "add medication" wizard).
 *
 * Behaviour:
 *   - Both drugs in active list: returns the cached `ScoredInteraction`
 *     (or `null` if the cache says they don't interact).
 *   - At least one drug not in active list: runs a single pair
 *     `classifyInteractions([a, b])` and writes the result into the
 *     cache so a repeat query is O(1).
 *
 * Idempotent: same input returns same output.
 */
export function searchPair(
  index: PairSearchIndex,
  a: Drug,
  b: Drug,
): ScoredInteraction | null {
  if (a.id === b.id) return null;
  const key = pairKey(a.id, b.id);
  const cached = index.pairs.get(key);
  if (cached !== undefined) {
    index.cachedQueries += 1;
    return cached;
  }
  // Run a 2-drug classification to reuse the canonical rules.
  const result = classifyInteractions([a, b]);
  const found = result[0] ?? null;
  if (found) {
    index.pairs.set(key, found);
  }
  return found;
}

/**
 * Every interaction `candidate` would create against the active list,
 * sorted by severity (highest first) then alphabetically.
 *
 * If candidate is already in the active list, returns its existing
 * pairs from the cache.
 */
export function searchAgainstActive(
  index: PairSearchIndex,
  candidate: Drug,
): ScoredInteraction[] {
  const out: ScoredInteraction[] = [];
  // If candidate IS one of the actives, we already have all its pairs.
  if (index.activeById.has(candidate.id)) {
    const neigh = index.neighbors.get(candidate.id);
    if (neigh) {
      for (const otherId of neigh) {
        const inter = index.pairs.get(pairKey(candidate.id, otherId));
        if (inter) out.push(inter);
      }
    }
  } else {
    for (const a of index.active) {
      const inter = searchPair(index, a, candidate);
      if (inter) out.push(inter);
    }
  }
  return sortInteractions(out);
}

/**
 * Return only the highest severity that `candidate` would introduce.
 * Useful for the "Add" button color-coding without listing every pair.
 */
export function worstSeverityAgainstActive(
  index: PairSearchIndex,
  candidate: Drug,
): SeverityLevel | null {
  const all = searchAgainstActive(index, candidate);
  if (!all.length) return null;
  // already sorted; first is worst.
  return all[0]!.severity;
}

/**
 * True when the worst pair between two ACTIVE drugs hits or exceeds
 * `threshold`. Default threshold is 'major'.
 */
export function hasMinSeverity(
  index: PairSearchIndex,
  threshold: SeverityLevel = 'major',
): boolean {
  const rank = SEVERITY_RANK[threshold];
  for (const inter of index.pairs.values()) {
    if (SEVERITY_RANK[inter.severity] >= rank) return true;
  }
  return false;
}

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  minor: 1,
  moderate: 2,
  major: 3,
  contraindicated: 4,
};

function sortInteractions(items: ScoredInteraction[]): ScoredInteraction[] {
  return [...items].sort((x, y) => {
    const d = SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity];
    return d !== 0 ? d : x.a.localeCompare(y.a);
  });
}

/**
 * Bulk: severity of every candidate in a search-result list. Useful
 * for color-coding an entire dropdown of candidates without N round
 * trips through `searchAgainstActive`.
 */
export interface CandidateSeveritySummary {
  candidateId: string;
  candidateGeneric: string;
  worst: SeverityLevel | null;
  count: number;
}

export function bulkScoreCandidates(
  index: PairSearchIndex,
  candidates: Drug[],
): CandidateSeveritySummary[] {
  const out: CandidateSeveritySummary[] = [];
  for (const c of candidates) {
    const interactions = searchAgainstActive(index, c);
    out.push({
      candidateId: c.id,
      candidateGeneric: c.generic,
      worst: interactions[0]?.severity ?? null,
      count: interactions.length,
    });
  }
  return out;
}

/**
 * Convenience: cast an interaction back to the wire-format `Interaction`
 * type if the caller needs to persist or send it (drops the
 * mechanism/action/rule fields that classifyInteractions adds).
 */
export function toWireInteraction(s: ScoredInteraction): Interaction {
  return {
    a: s.a,
    b: s.b,
    severity: s.severity,
    note: s.note,
  };
}
