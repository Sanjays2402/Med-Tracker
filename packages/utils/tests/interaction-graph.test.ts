import { describe, it, expect } from 'vitest';
import { buildInteractionGraph, rankSwapCandidates } from '../src/interaction-graph';
import type { Drug } from '@med/types';

function drug(over: Partial<Drug>): Drug {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    generic: over.generic ?? 'generic',
    brand: over.brand ?? 'Brand',
    class: over.class ?? 'class',
    rxnormSample: 0,
    indications: [],
    dosages: [],
    routes: [],
    frequencies: [],
    interactions: over.interactions ?? [],
    warnings: over.warnings ?? [],
    pregnancyCategory: 'C',
    storage: 'room',
    sourceNote: 'test',
  } as Drug;
}

describe('buildInteractionGraph', () => {
  it('returns empty edges and clean summary for a single drug', () => {
    const g = buildInteractionGraph([drug({ id: 'a', generic: 'metformin', class: 'biguanide' })]);
    expect(g.edges).toHaveLength(0);
    expect(g.clusters).toHaveLength(0);
    expect(g.worstSeverity).toBeNull();
    expect(g.riskScore).toBe(0);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.degree).toBe(0);
    expect(g.summary).toMatch(/no interactions/i);
  });

  it('builds an edge for a known contraindicated pair and reports worst severity', () => {
    const g = buildInteractionGraph([
      drug({ id: 'a', generic: 'phenelzine', class: 'MAOI' }),
      drug({ id: 'b', generic: 'sertraline', class: 'SSRI' }),
    ]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]!.severity).toBe('contraindicated');
    expect(g.worstSeverity).toBe('contraindicated');
    expect(g.riskScore).toBe(15);
    expect(g.clusters).toHaveLength(1);
    expect(g.clusters[0]!.drugIds).toEqual(['a', 'b']);
  });

  it('finds a transitive cluster across three interacting drugs', () => {
    const g = buildInteractionGraph([
      drug({ id: 'w', generic: 'warfarin', class: 'anticoagulant' }),
      drug({ id: 'n', generic: 'ibuprofen', class: 'NSAID' }),
      drug({ id: 'f', generic: 'fluconazole', class: 'antifungal' }),
      drug({ id: 'm', generic: 'metformin', class: 'biguanide' }),
    ]);
    expect(g.clusters).toHaveLength(1);
    expect(g.clusters[0]!.drugIds).toContain('w');
    expect(g.clusters[0]!.drugIds).toContain('n');
    expect(g.clusters[0]!.drugIds).toContain('f');
    expect(g.clusters[0]!.drugIds).not.toContain('m');
    expect(g.clusters[0]!.edgeCount).toBeGreaterThanOrEqual(2);
    expect(g.hubs[0]).toBe('w');
  });

  it('separates unconnected interaction clusters', () => {
    const g = buildInteractionGraph([
      drug({ id: '1', generic: 'phenelzine', class: 'MAOI' }),
      drug({ id: '2', generic: 'sertraline', class: 'SSRI' }),
      drug({ id: '3', generic: 'alprazolam', class: 'benzodiazepine' }),
      drug({ id: '4', generic: 'oxycodone', class: 'opioid' }),
    ]);
    expect(g.clusters).toHaveLength(2);
    expect(g.clusters[0]!.worstSeverity).toBe('contraindicated');
  });

  it('is deterministic across input orderings', () => {
    const a = [
      drug({ id: 'w', generic: 'warfarin', class: 'anticoagulant' }),
      drug({ id: 'n', generic: 'ibuprofen', class: 'NSAID' }),
    ];
    const b = [...a].reverse();
    expect(buildInteractionGraph(a)).toEqual(buildInteractionGraph(b));
  });
});

describe('rankSwapCandidates', () => {
  it('ranks the hub drug as the highest risk reduction candidate', () => {
    const drugs = [
      drug({ id: 'w', generic: 'warfarin', class: 'anticoagulant' }),
      drug({ id: 'n', generic: 'ibuprofen', class: 'NSAID' }),
      drug({ id: 'f', generic: 'fluconazole', class: 'antifungal' }),
      drug({ id: 'm', generic: 'metformin', class: 'biguanide' }),
    ];
    const ranked = rankSwapCandidates(drugs);
    expect(ranked[0]!.drugId).toBe('w');
    expect(ranked[0]!.riskReduction).toBeGreaterThan(0);
    const metformin = ranked.find((c) => c.drugId === 'm')!;
    expect(metformin.riskReduction).toBe(0);
  });
});
