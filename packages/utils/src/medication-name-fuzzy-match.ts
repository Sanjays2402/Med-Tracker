/**
 * Fuzzy match a typed medication name against the drug catalog.
 *
 * The "add medication" input is one of the highest-stakes typing
 * surfaces in the whole app: a typo that silently picks the wrong
 * drug can produce a regimen mismatch the user never notices. The
 * matcher needs to:
 *
 *   - tolerate small typos (`lisinapril` -> `lisinopril`),
 *   - tolerate transposition (`metforimn` -> `metformin`),
 *   - prefer prefix matches over middle-of-word edits
 *     (`lis` favours `lisinopril` over `aripiprazole`),
 *   - resolve brand-to-generic and generic-to-brand both directions
 *     (`tylenol` -> acetaminophen, `acetaminophen` -> Tylenol),
 *   - never silently return a wrong-class drug above the score floor
 *     even when nothing matches well; instead return an empty list and
 *     let the UI prompt for explicit confirmation,
 *   - report WHICH field matched so the UI can render
 *     "Lisinopril (brand: Prinivil)" rather than only the typed query.
 *
 * Pure / deterministic. No I/O.
 */

import type { DrugIndexEntry } from '@med/types';

export type MatchField = 'generic' | 'brand' | 'class';

export interface FuzzyMatchOptions {
  /** Max results returned. Default 5. */
  limit?: number;
  /**
   * Minimum normalized score in [0, 1] for a result to be included.
   * Default 0.55 (empirically: 1 edit on a 6-char word lands ~0.83,
   * 2 edits on a 6-char word lands ~0.66, completely different words
   * land below 0.4).
   */
  minScore?: number;
  /**
   * If true, prefix matches receive a small bonus so single-letter
   * queries surface a sensible starting list. Default true.
   */
  prefixBonus?: boolean;
}

export interface FuzzyMatchResult {
  drugId: string;
  generic: string;
  brand: string;
  class: string;
  /** Normalized score in [0, 1]. Higher is closer. */
  score: number;
  /** Underlying edit distance against the best-matching field. */
  distance: number;
  /** Field that produced the winning match. */
  matchedField: MatchField;
  /** Whether the winning match was an exact (case/punctuation insensitive) hit. */
  exact: boolean;
}

const SUFFIX_NOISE = /\b(xl|xr|er|sr|cr|odt|dr|hcl|hcl\s*er|extended[-\s]?release|tablet|capsule|liquid|injection|patch|inhaler|cream|drops|suppository|powder)\b/g;
const PUNCT = /[^a-z0-9\s]/g;
const SPACES = /\s+/g;

/**
 * Normalize a name for comparison: lowercase, strip dosage-form
 * suffixes (`XL`, `ER`, `HCL`), strip punctuation, collapse spaces.
 * Exported so callers (and tests) can debug match decisions.
 */
export function normalizeDrugName(s: string): string {
  return s
    .toLowerCase()
    .replace(SUFFIX_NOISE, ' ')
    .replace(PUNCT, ' ')
    .replace(SPACES, ' ')
    .trim();
}

/**
 * Damerau-Levenshtein edit distance: counts insertions, deletions,
 * substitutions AND adjacent transpositions as a single edit
 * (so `metforimn` -> `metformin` costs 1, not 2).
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  // dp[i][j] = distance between a[:i] and b[:j]
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const above = dp[i - 1]![j]! + 1;
      const left = dp[i]![j - 1]! + 1;
      const diag = dp[i - 1]![j - 1]! + cost;
      let best = Math.min(above, left, diag);
      // Damerau transposition: a[i-1]a[i-2] swapped vs b[j-2]b[j-1].
      if (
        i > 1 && j > 1 &&
        a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
      ) {
        best = Math.min(best, dp[i - 2]![j - 2]! + 1);
      }
      dp[i]![j] = best;
    }
  }
  return dp[a.length]![b.length]!;
}

/**
 * Score a single (query, candidate) pair. Returns a number in [0, 1]
 * where 1 is an exact match. The score is 1 - distance/max(len) with
 * a small prefix bonus (capped so an exact match still tops a prefix
 * hit on a longer string).
 */
function scoreCandidate(query: string, candidate: string, prefixBonus: boolean): { score: number; distance: number } {
  if (!query || !candidate) return { score: 0, distance: Math.max(query.length, candidate.length) };
  if (query === candidate) return { score: 1, distance: 0 };
  const d = editDistance(query, candidate);
  const maxLen = Math.max(query.length, candidate.length);
  let raw = 1 - d / maxLen;
  if (prefixBonus && candidate.startsWith(query) && query.length >= 2) {
    // Reward prefix hits when the query is meaningful (>= 2 chars).
    // Bonus is small (0.05 max) so an exact match still wins.
    const bonus = 0.05 * (query.length / candidate.length);
    raw = Math.min(0.99, raw + bonus);
  }
  return { score: Math.max(0, raw), distance: d };
}

/**
 * Fuzzy-match `query` against `catalog`, returning the best matches
 * sorted by score descending. Brand and generic are scored separately
 * and the higher of the two wins per drug (so `tylenol` ranks acetaminophen
 * via its brand, and `acetaminophen` ranks the same drug via its generic).
 *
 * Class is also scored but with a 0.7 weight so a class-name typo can't
 * outrank a real generic/brand match.
 */
export function fuzzyMatchDrugs(
  query: string,
  catalog: DrugIndexEntry[],
  options: FuzzyMatchOptions = {},
): FuzzyMatchResult[] {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0.55;
  const prefixBonus = options.prefixBonus !== false;
  const q = normalizeDrugName(query);
  if (!q) return [];

  const out: FuzzyMatchResult[] = [];
  for (const drug of catalog) {
    const fields: Array<{ field: MatchField; value: string; weight: number }> = [
      { field: 'generic', value: normalizeDrugName(drug.generic), weight: 1 },
      { field: 'brand', value: normalizeDrugName(drug.brand), weight: 1 },
      { field: 'class', value: normalizeDrugName(drug.class), weight: 0.7 },
    ];
    let best: { field: MatchField; score: number; distance: number } | null = null;
    for (const f of fields) {
      if (!f.value) continue;
      const { score, distance } = scoreCandidate(q, f.value, prefixBonus);
      const weighted = score * f.weight;
      if (!best || weighted > best.score) {
        best = { field: f.field, score: weighted, distance };
      }
    }
    if (!best || best.score < minScore) continue;
    out.push({
      drugId: drug.id,
      generic: drug.generic,
      brand: drug.brand,
      class: drug.class,
      score: Number(best.score.toFixed(4)),
      distance: best.distance,
      matchedField: best.field,
      exact: best.distance === 0,
    });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distance !== b.distance) return a.distance - b.distance;
    // Tiebreak alphabetically by generic for stable rendering.
    return a.generic.localeCompare(b.generic);
  });
  return out.slice(0, limit);
}

/**
 * Convenience: return the single best match or null.
 * `acceptScore` controls the minimum score required (defaults to 0.8
 * to avoid silent miss-classification at the high-confidence path).
 */
export function bestDrugMatch(
  query: string,
  catalog: DrugIndexEntry[],
  acceptScore = 0.8,
): FuzzyMatchResult | null {
  const matches = fuzzyMatchDrugs(query, catalog, { limit: 1, minScore: acceptScore });
  return matches[0] ?? null;
}
