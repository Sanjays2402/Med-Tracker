/**
 * Pill identifier.
 *
 * Given partial physical attributes a patient reads off a tablet (imprint
 * text, color, shape, and optional scoring/size), score a catalog of known
 * pill descriptors and return the most likely matches.
 *
 * The matcher is deliberately conservative: an exact imprint match dominates
 * the score, color and shape contribute moderate weight, and ambiguous
 * fields are simply ignored rather than penalized. This avoids ranking a
 * vague guess above a confident partial match.
 *
 * This module ships with no data of its own. A pill descriptor list is
 * loaded by the caller (drug catalog, FDA NDC, or a clinician-provided
 * sheet) and passed in. Pure, deterministic, browser-safe.
 */

export type PillShape =
  | 'round'
  | 'oval'
  | 'oblong'
  | 'capsule'
  | 'triangle'
  | 'square'
  | 'rectangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'other';

export type PillColor =
  | 'white'
  | 'off-white'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'blue'
  | 'green'
  | 'brown'
  | 'gray'
  | 'black'
  | 'clear';

export interface PillDescriptor {
  /** Catalog identifier (typically the medication or NDC id). */
  id: string;
  /** Display name; not used in scoring. */
  name: string;
  /** Imprint text exactly as printed; matcher normalizes case and spacing. */
  imprint?: string;
  shape?: PillShape;
  /**
   * Color or colors. Two-tone capsules list both halves. The matcher counts
   * a hit when any query color matches any descriptor color.
   */
  colors?: PillColor[];
  /** Whether the tablet is scored (split line). */
  scored?: boolean;
  /** Long axis length in millimeters. */
  sizeMm?: number;
}

export interface PillQuery {
  imprint?: string;
  shape?: PillShape;
  colors?: PillColor[];
  scored?: boolean;
  /** Patient measured length. Matches within `sizeToleranceMm` count. */
  sizeMm?: number;
}

export interface PillMatchOptions {
  /** Minimum score (0..1) to include in results. Default 0.25. */
  minScore?: number;
  /** Maximum results returned. Default 10. */
  limit?: number;
  /** Tolerance for sizeMm comparisons in millimeters. Default 1.5. */
  sizeToleranceMm?: number;
}

export interface PillMatch {
  descriptor: PillDescriptor;
  score: number;
  /** Per-attribute contributions, useful for explaining ranking in the UI. */
  reasons: string[];
}

/**
 * Score weights are chosen so a single exact-imprint hit (1.0 * 0.55 = 0.55)
 * beats every color/shape combination, while still leaving room for
 * imprint + shape + color matches to approach 1.0.
 */
const WEIGHTS = {
  imprint: 0.55,
  shape: 0.2,
  color: 0.2,
  scored: 0.025,
  size: 0.025,
};

function normalizeImprint(s: string): string {
  return s
    .toUpperCase()
    .replace(/[\s\u2010-\u2015._/\\,;:|]+/g, ' ')
    .trim();
}

/** Imprint similarity 0..1. Exact match = 1, substring = 0.8, otherwise token Jaccard. */
export function imprintSimilarity(query: string, candidate: string): number {
  const q = normalizeImprint(query);
  const c = normalizeImprint(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.8;
  const qt = new Set(q.split(' '));
  const ct = new Set(c.split(' '));
  let inter = 0;
  for (const t of qt) if (ct.has(t)) inter++;
  const union = qt.size + ct.size - inter;
  if (union === 0) return 0;
  return inter / union;
}

function colorOverlap(query: PillColor[], candidate: PillColor[]): number {
  if (!query.length || !candidate.length) return 0;
  let hits = 0;
  for (const c of query) if (candidate.includes(c)) hits++;
  return hits / Math.max(query.length, candidate.length);
}

export function scorePill(query: PillQuery, descriptor: PillDescriptor, opts: PillMatchOptions = {}): PillMatch {
  const reasons: string[] = [];
  let raw = 0;
  let available = 0;

  if (query.imprint !== undefined) {
    available += WEIGHTS.imprint;
    if (descriptor.imprint) {
      const sim = imprintSimilarity(query.imprint, descriptor.imprint);
      raw += sim * WEIGHTS.imprint;
      if (sim >= 0.99) reasons.push(`imprint exact: ${descriptor.imprint}`);
      else if (sim > 0) reasons.push(`imprint partial: ${descriptor.imprint}`);
    }
  }

  if (query.shape !== undefined) {
    available += WEIGHTS.shape;
    if (descriptor.shape && descriptor.shape === query.shape) {
      raw += WEIGHTS.shape;
      reasons.push(`shape ${descriptor.shape}`);
    }
  }

  if (query.colors !== undefined && query.colors.length > 0) {
    available += WEIGHTS.color;
    if (descriptor.colors && descriptor.colors.length > 0) {
      const o = colorOverlap(query.colors, descriptor.colors);
      raw += o * WEIGHTS.color;
      if (o > 0) reasons.push(`color overlap ${(o * 100).toFixed(0)}%`);
    }
  }

  if (query.scored !== undefined) {
    available += WEIGHTS.scored;
    if (descriptor.scored !== undefined && descriptor.scored === query.scored) {
      raw += WEIGHTS.scored;
      reasons.push(query.scored ? 'scored' : 'not scored');
    }
  }

  if (query.sizeMm !== undefined && descriptor.sizeMm !== undefined) {
    available += WEIGHTS.size;
    const tolerance = opts.sizeToleranceMm ?? 1.5;
    if (Math.abs(query.sizeMm - descriptor.sizeMm) <= tolerance) {
      raw += WEIGHTS.size;
      reasons.push(`size ${descriptor.sizeMm}mm`);
    }
  }

  const score = available === 0 ? 0 : raw / available;
  return { descriptor, score, reasons };
}

export function identifyPill(
  query: PillQuery,
  catalog: PillDescriptor[],
  opts: PillMatchOptions = {},
): PillMatch[] {
  const min = opts.minScore ?? 0.25;
  const limit = opts.limit ?? 10;
  const out: PillMatch[] = [];
  for (const d of catalog) {
    const m = scorePill(query, d, opts);
    if (m.score >= min) out.push(m);
  }
  out.sort((a, b) => b.score - a.score || a.descriptor.id.localeCompare(b.descriptor.id));
  return out.slice(0, limit);
}
