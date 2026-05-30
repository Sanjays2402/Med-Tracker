import { describe, it, expect } from 'vitest';
import { classifyInteractions, maxSeverity, SEVERITY_RULES } from '../src/interaction-severity';
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

describe('classifyInteractions', () => {
  it('flags MAOI + SSRI as contraindicated', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'phenelzine', class: 'MAOI' }),
      drug({ id: '2', generic: 'sertraline', class: 'SSRI' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.severity).toBe('contraindicated');
    expect(r[0]!.rule).toBe('maoi-serotonergic');
    expect(r[0]!.action).toMatch(/washout/i);
  });

  it('flags warfarin + ibuprofen as major bleeding risk', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'warfarin', class: 'anticoagulant' }),
      drug({ id: '2', generic: 'ibuprofen', class: 'NSAID' }),
    ]);
    expect(r[0]!.severity).toBe('major');
    expect(r[0]!.mechanism).toMatch(/bleeding/i);
  });

  it('flags benzo + opioid as major', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'alprazolam', class: 'benzodiazepine' }),
      drug({ id: '2', generic: 'oxycodone', class: 'opioid' }),
    ]);
    expect(r[0]!.severity).toBe('major');
    expect(r[0]!.rule).toBe('benzo-opioid');
  });

  it('flags QT-prolonging pair', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'amiodarone', class: 'antiarrhythmic' }),
      drug({ id: '2', generic: 'ondansetron', class: 'antiemetic' }),
    ]);
    expect(r[0]!.severity).toBe('major');
    expect(r[0]!.rule).toBe('qt-additive');
  });

  it('returns empty for unrelated drugs', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'acetaminophen', class: 'analgesic' }),
      drug({ id: '2', generic: 'cetirizine', class: 'antihistamine' }),
    ]);
    expect(r).toEqual([]);
  });

  it('deduplicates pairs and is order independent', () => {
    const a = drug({ id: '1', generic: 'warfarin', class: 'anticoagulant' });
    const b = drug({ id: '2', generic: 'naproxen', class: 'NSAID' });
    expect(classifyInteractions([a, b])).toHaveLength(1);
    expect(classifyInteractions([b, a])).toHaveLength(1);
  });

  it('escalates keyword overlap to contraindicated when warnings say so', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'drugx', class: 'classx', interactions: ['drugy'] }),
      drug({ id: '2', generic: 'drugy', class: 'classy', warnings: ['Contraindicated with drugx'] }),
    ]);
    expect(r[0]!.severity).toBe('contraindicated');
  });

  it('sorts results by severity descending', () => {
    const r = classifyInteractions([
      drug({ id: '1', generic: 'lisinopril', class: 'ACE inhibitor' }),
      drug({ id: '2', generic: 'spironolactone', class: 'potassium-sparing diuretic' }),
      drug({ id: '3', generic: 'warfarin', class: 'anticoagulant' }),
      drug({ id: '4', generic: 'ibuprofen', class: 'NSAID' }),
    ]);
    expect(r[0]!.severity).toBe('major');
    expect(r.at(-1)!.severity).toBe('moderate');
  });

  it('maxSeverity returns the highest level', () => {
    expect(maxSeverity([{ severity: 'minor' }, { severity: 'major' }])).toBe('major');
    expect(maxSeverity([])).toBeNull();
  });

  it('all rules have non-empty mechanism and action', () => {
    for (const r of SEVERITY_RULES) {
      expect(r.mechanism.length).toBeGreaterThan(10);
      expect(r.action.length).toBeGreaterThan(10);
      expect(r.a.length).toBeGreaterThan(0);
      expect(r.b.length).toBeGreaterThan(0);
    }
  });
});
