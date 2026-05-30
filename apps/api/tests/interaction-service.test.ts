import { describe, it, expect } from 'vitest';
import { InteractionService } from '../src/services/InteractionService';
import type { Drug } from '@med/types';

function d(over: Partial<Drug>): Drug {
  return {
    id: over.id!,
    generic: over.generic ?? 'g',
    brand: 'b',
    class: over.class ?? 'c',
    rxnormSample: 0,
    indications: [],
    dosages: [],
    routes: [],
    frequencies: [],
    interactions: [],
    warnings: [],
    pregnancyCategory: 'C',
    storage: 'room',
    sourceNote: '',
  } as Drug;
}

const fakeCatalog = {
  byIds(ids: string[]) {
    const all: Drug[] = [
      d({ id: 'w', generic: 'warfarin', class: 'anticoagulant' }),
      d({ id: 'n', generic: 'naproxen', class: 'NSAID' }),
      d({ id: 'a', generic: 'acetaminophen', class: 'analgesic' }),
    ];
    return all.filter((x) => ids.includes(x.id));
  },
};

describe('InteractionService', () => {
  it('returns scored report with counts and highest severity', () => {
    const s = new InteractionService(fakeCatalog);
    const r = s.classifyByIds(['w', 'n']);
    expect(r.highest).toBe('major');
    expect(r.counts.major).toBe(1);
    expect(r.checkedDrugIds).toEqual(['w', 'n']);
    expect(r.unknownDrugIds).toEqual([]);
  });

  it('reports unknown drug ids', () => {
    const s = new InteractionService(fakeCatalog);
    const r = s.classifyByIds(['w', 'zzz']);
    expect(r.unknownDrugIds).toEqual(['zzz']);
    expect(r.interactions).toEqual([]);
    expect(r.highest).toBeNull();
  });

  it('deduplicates input ids', () => {
    const s = new InteractionService(fakeCatalog);
    const r = s.classifyByIds(['w', 'w', 'n']);
    expect(r.checkedDrugIds).toEqual(['w', 'n']);
  });

  it('returns empty interactions for non-interacting drugs', () => {
    const s = new InteractionService(fakeCatalog);
    const r = s.classifyByIds(['a', 'w']);
    expect(r.interactions).toEqual([]);
    expect(r.counts).toEqual({ minor: 0, moderate: 0, major: 0, contraindicated: 0 });
  });
});
