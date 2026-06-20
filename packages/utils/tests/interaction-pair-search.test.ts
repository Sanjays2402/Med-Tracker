import { describe, it, expect } from 'vitest';
import {
  buildPairSearchIndex,
  searchPair,
  searchAgainstActive,
  worstSeverityAgainstActive,
  hasMinSeverity,
  bulkScoreCandidates,
  toWireInteraction,
} from '../src/interaction-pair-search';
import type { Drug } from '@med/types';

function drug(
  id: string,
  generic: string,
  klass: string,
  extras: Partial<Drug> = {},
): Drug {
  return {
    id,
    generic,
    brand: generic,
    class: klass,
    rxnormSample: 0,
    indications: [],
    dosages: [],
    routes: [],
    frequencies: [],
    interactions: [],
    warnings: [],
    pregnancyCategory: 'B',
    storage: '',
    sourceNote: '',
    ...extras,
  };
}

// Curated set of drugs that produce known interactions per SEVERITY_RULES.
const WARFARIN = drug('d-warfarin', 'warfarin', 'anticoagulant');
const IBUPROFEN = drug('d-ibuprofen', 'ibuprofen', 'nsaid');
const AMIODARONE = drug('d-amiodarone', 'amiodarone', 'antiarrhythmic');
const DIGOXIN = drug('d-digoxin', 'digoxin', 'cardiac glycoside');
const SIMVASTATIN = drug('d-simvastatin', 'simvastatin', 'statin');
const CLARITHROMYCIN = drug('d-clarithro', 'clarithromycin', 'macrolide');
const METFORMIN = drug('d-metformin', 'metformin', 'biguanide');
const LISINOPRIL = drug('d-lisinopril', 'lisinopril', 'ace inhibitor');

describe('buildPairSearchIndex', () => {
  it('precomputes pair severities for the active list', () => {
    const idx = buildPairSearchIndex([WARFARIN, IBUPROFEN, METFORMIN]);
    // warfarin + ibuprofen is a curated major interaction.
    const pair = idx.pairs.get(['d-ibuprofen', 'd-warfarin'].sort().join('|'));
    expect(pair).toBeDefined();
    expect(pair!.severity).toBe('major');
    expect(pair!.rule).toBe('warfarin-nsaid');
  });

  it('does NOT cache pairs that do not interact', () => {
    const idx = buildPairSearchIndex([METFORMIN, LISINOPRIL]);
    expect(idx.pairs.size).toBe(0);
  });

  it('builds a per-drug neighbor set for fast iteration', () => {
    const idx = buildPairSearchIndex([
      WARFARIN,
      IBUPROFEN,
      AMIODARONE,
      DIGOXIN,
    ]);
    // warfarin neighbors: ibuprofen (nsaid), amiodarone (cyp2c9)
    const wn = idx.neighbors.get('d-warfarin')!;
    expect(wn.has('d-ibuprofen')).toBe(true);
    expect(wn.has('d-amiodarone')).toBe(true);
    // digoxin + amiodarone is a curated major (pgp inhibition).
    const dn = idx.neighbors.get('d-digoxin')!;
    expect(dn.has('d-amiodarone')).toBe(true);
  });

  it('initialises empty neighbor sets for non-interacting drugs', () => {
    const idx = buildPairSearchIndex([METFORMIN, LISINOPRIL]);
    expect(idx.neighbors.get('d-metformin')).toBeDefined();
    expect(idx.neighbors.get('d-metformin')!.size).toBe(0);
  });
});

describe('searchPair', () => {
  it('returns a cached pair from the index in O(1)', () => {
    const idx = buildPairSearchIndex([WARFARIN, IBUPROFEN]);
    const before = idx.cachedQueries;
    const result = searchPair(idx, WARFARIN, IBUPROFEN);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('major');
    expect(idx.cachedQueries).toBe(before + 1);
  });

  it('returns null for the same drug paired with itself', () => {
    const idx = buildPairSearchIndex([WARFARIN]);
    expect(searchPair(idx, WARFARIN, WARFARIN)).toBeNull();
  });

  it('falls back to a 2-drug classifyInteractions call when one drug is new', () => {
    // Only warfarin is in active. Ask about a candidate not yet added.
    const idx = buildPairSearchIndex([WARFARIN]);
    const result = searchPair(idx, WARFARIN, IBUPROFEN);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('major');
    // After the first miss, the result should be cached.
    const key = ['d-ibuprofen', 'd-warfarin'].sort().join('|');
    expect(idx.pairs.has(key)).toBe(true);
  });

  it('returns null when neither drug interacts and the pair is novel', () => {
    const idx = buildPairSearchIndex([METFORMIN]);
    expect(searchPair(idx, METFORMIN, LISINOPRIL)).toBeNull();
  });

  it('writes a hit to the cache on the first miss so a repeat query is O(1)', () => {
    const idx = buildPairSearchIndex([WARFARIN]);
    const first = searchPair(idx, WARFARIN, IBUPROFEN);
    const queriesAfterFirst = idx.cachedQueries;
    const second = searchPair(idx, WARFARIN, IBUPROFEN);
    expect(second).toEqual(first);
    expect(idx.cachedQueries).toBe(queriesAfterFirst + 1);
  });
});

describe('searchAgainstActive', () => {
  it('returns every interaction a candidate would create, sorted by severity', () => {
    const idx = buildPairSearchIndex([WARFARIN, METFORMIN]);
    const hits = searchAgainstActive(idx, IBUPROFEN);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe('major');
  });

  it('returns existing pairs when the candidate is already in active list', () => {
    const idx = buildPairSearchIndex([WARFARIN, IBUPROFEN, METFORMIN]);
    const hits = searchAgainstActive(idx, WARFARIN);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.severity).toBe('major');
  });

  it('returns empty array when candidate has no interactions with active list', () => {
    const idx = buildPairSearchIndex([METFORMIN, LISINOPRIL]);
    const hits = searchAgainstActive(idx, IBUPROFEN);
    expect(hits).toHaveLength(0);
  });

  it('sorts most severe first, then alphabetically by drug a', () => {
    // Build active list that produces both a major (warfarin+ibuprofen)
    // and a moderate (lisinopril+spironolactone via raas-potassium).
    const SPIRONOLACTONE = drug('d-spiro', 'spironolactone', 'potassium-sparing');
    // Candidate adds both major and moderate edges.
    const idx = buildPairSearchIndex([WARFARIN, LISINOPRIL, SPIRONOLACTONE]);
    // Already cached: spironolactone+lisinopril (moderate)
    const cached = idx.pairs.get(['d-lisinopril', 'd-spiro'].sort().join('|'));
    expect(cached).toBeDefined();
    expect(cached!.severity).toBe('moderate');
    // Now ask about ibuprofen against actives.
    const hits = searchAgainstActive(idx, IBUPROFEN);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.severity).toBe('major'); // warfarin+ibuprofen first
  });
});

describe('worstSeverityAgainstActive', () => {
  it('returns the worst severity a candidate would introduce', () => {
    const idx = buildPairSearchIndex([WARFARIN, METFORMIN]);
    expect(worstSeverityAgainstActive(idx, IBUPROFEN)).toBe('major');
  });

  it('returns null when no interaction exists', () => {
    const idx = buildPairSearchIndex([METFORMIN]);
    expect(worstSeverityAgainstActive(idx, LISINOPRIL)).toBeNull();
  });
});

describe('hasMinSeverity', () => {
  it('returns true when active list contains a major interaction', () => {
    const idx = buildPairSearchIndex([WARFARIN, IBUPROFEN]);
    expect(hasMinSeverity(idx)).toBe(true);
    expect(hasMinSeverity(idx, 'moderate')).toBe(true);
    expect(hasMinSeverity(idx, 'contraindicated')).toBe(false);
  });

  it('returns false on a clean active list', () => {
    const idx = buildPairSearchIndex([METFORMIN, LISINOPRIL]);
    expect(hasMinSeverity(idx)).toBe(false);
  });
});

describe('bulkScoreCandidates', () => {
  it('summarises severity and pair count per candidate', () => {
    const idx = buildPairSearchIndex([WARFARIN, SIMVASTATIN]);
    const out = bulkScoreCandidates(idx, [IBUPROFEN, CLARITHROMYCIN, METFORMIN]);
    const byId = new Map(out.map((s) => [s.candidateId, s]));
    // ibuprofen vs warfarin -> major
    expect(byId.get('d-ibuprofen')!.worst).toBe('major');
    expect(byId.get('d-ibuprofen')!.count).toBeGreaterThanOrEqual(1);
    // clarithromycin vs simvastatin -> major (statin-cyp3a4)
    expect(byId.get('d-clarithro')!.worst).toBe('major');
    // metformin vs neither -> null
    expect(byId.get('d-metformin')!.worst).toBeNull();
    expect(byId.get('d-metformin')!.count).toBe(0);
  });

  it('returns one summary entry per candidate, in input order', () => {
    const idx = buildPairSearchIndex([WARFARIN]);
    const out = bulkScoreCandidates(idx, [
      LISINOPRIL,
      IBUPROFEN,
      METFORMIN,
    ]);
    expect(out.map((s) => s.candidateId)).toEqual([
      'd-lisinopril',
      'd-ibuprofen',
      'd-metformin',
    ]);
  });
});

describe('toWireInteraction', () => {
  it('strips the mechanism/action/rule fields for persistence', () => {
    const idx = buildPairSearchIndex([WARFARIN, IBUPROFEN]);
    const scored = searchPair(idx, WARFARIN, IBUPROFEN)!;
    const wire = toWireInteraction(scored);
    expect(wire.a).toBe(scored.a);
    expect(wire.b).toBe(scored.b);
    expect(wire.severity).toBe(scored.severity);
    expect(wire.note).toBe(scored.note);
    expect(Object.keys(wire).sort()).toEqual(['a', 'b', 'note', 'severity']);
  });
});

describe('memoisation behaviour', () => {
  it('repeated queries inside the active set are served entirely from cache', () => {
    const idx = buildPairSearchIndex([WARFARIN, IBUPROFEN, METFORMIN]);
    const before = idx.pairs.size;
    for (let i = 0; i < 100; i++) {
      searchPair(idx, WARFARIN, IBUPROFEN);
    }
    // No new entries should have been added.
    expect(idx.pairs.size).toBe(before);
    expect(idx.cachedQueries).toBe(100);
  });

  it('first miss adds exactly one entry; subsequent misses for the same pair add zero', () => {
    const idx = buildPairSearchIndex([WARFARIN]);
    expect(idx.pairs.size).toBe(0);
    searchPair(idx, WARFARIN, IBUPROFEN);
    expect(idx.pairs.size).toBe(1);
    searchPair(idx, WARFARIN, IBUPROFEN);
    expect(idx.pairs.size).toBe(1);
  });
});
