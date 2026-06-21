import { describe, it, expect } from 'vitest';
import {
  buildBundleFromConditions,
  buildBundleFromIcd10,
  conditionForIcd10,
  summarizeBundle,
  CONDITIONS,
} from '../src/drug-class-coverage-bundles-builder';
import {
  computeCoverage,
  classifyDrug,
  type MedicationDrugLink,
} from '../src/drug-class-coverage';
import type { Drug } from '@med/types';

function drug(id: string, generic: string, klass: string, extras: Partial<Drug> = {}): Drug {
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

describe('conditionForIcd10', () => {
  it('maps I25 -> cad', () => {
    expect(conditionForIcd10('I25')).toBe('cad');
  });

  it('maps I25.10 (with decimal) -> cad', () => {
    expect(conditionForIcd10('I25.10')).toBe('cad');
  });

  it('maps E11.9 -> dm2', () => {
    expect(conditionForIcd10('E11.9')).toBe('dm2');
  });

  it('case-insensitive: e11 -> dm2', () => {
    expect(conditionForIcd10('e11')).toBe('dm2');
  });

  it('distinguishes I50.4 (HFrEF) from I50.3 (HFpEF)', () => {
    expect(conditionForIcd10('I50.40')).toBe('hfref');
    // HFpEF (I50.3*) is intentionally not in the table yet.
    expect(conditionForIcd10('I50.30')).toBeNull();
  });

  it('maps J44.x -> copd', () => {
    expect(conditionForIcd10('J44.0')).toBe('copd');
  });

  it('maps J45.x -> asthma', () => {
    expect(conditionForIcd10('J45.901')).toBe('asthma');
  });

  it('maps N18.x -> ckd', () => {
    expect(conditionForIcd10('N18.3')).toBe('ckd');
  });

  it('maps F32 and F33 -> mdd', () => {
    expect(conditionForIcd10('F32.1')).toBe('mdd');
    expect(conditionForIcd10('F33.0')).toBe('mdd');
  });

  it('returns null for unknown codes', () => {
    expect(conditionForIcd10('Z00')).toBeNull();
    expect(conditionForIcd10('')).toBeNull();
    expect(conditionForIcd10('   ')).toBeNull();
  });

  it('whitespace-tolerant', () => {
    expect(conditionForIcd10('  i10  ')).toBe('htn');
  });
});

describe('CONDITIONS table', () => {
  it('every condition has at least one ICD-10 prefix', () => {
    for (const c of CONDITIONS) {
      expect(c.icd10Prefixes.length).toBeGreaterThan(0);
    }
  });

  it('every required entry has a rationale', () => {
    for (const c of CONDITIONS) {
      for (const r of c.required) expect(r.rationale.length).toBeGreaterThan(0);
    }
  });
});

describe('buildBundleFromConditions — single condition', () => {
  it('builds a CAD bundle', () => {
    const bundle = buildBundleFromConditions(['cad']);
    expect(bundle.conditions).toEqual(['cad']);
    expect(bundle.required.length).toBeGreaterThanOrEqual(3);
    expect(bundle.label).toMatch(/Coronary artery disease/);
  });

  it('builds a CKD bundle with NSAIDs on the avoid list', () => {
    const bundle = buildBundleFromConditions(['ckd']);
    expect(bundle.avoid.map((a) => a.code)).toContain('nsaid');
    expect(bundle.avoid.find((a) => a.code === 'nsaid')!.rationale[0]).toMatch(/AKI/);
  });

  it('builds an empty bundle with no conditions', () => {
    const bundle = buildBundleFromConditions([] as never);
    expect(bundle.conditions).toEqual([]);
    expect(bundle.required).toEqual([]);
    expect(bundle.label).toMatch(/no conditions/);
  });
});

describe('buildBundleFromConditions — union behaviour', () => {
  it('combines CAD + DM2 into a multi-condition bundle', () => {
    const bundle = buildBundleFromConditions(['cad', 'dm2']);
    expect(bundle.conditions).toEqual(['cad', 'dm2']);
    // CAD: statin, antiplatelet, beta-blocker, ace-i/arb (4 entries).
    // DM2: metformin (1 entry).
    expect(bundle.required.length).toBeGreaterThanOrEqual(5);
    // preferSingle unions.
    expect(bundle.preferSingle).toContain('metformin');
    expect(bundle.preferSingle).toContain('statin');
  });

  it('deduplicates condition codes', () => {
    const bundle = buildBundleFromConditions(['cad', 'cad']);
    expect(bundle.conditions).toEqual(['cad']);
  });

  it('combines avoid lists across conditions', () => {
    const bundle = buildBundleFromConditions(['ckd', 'asthma']);
    // Both CKD and asthma avoid NSAIDs.
    const nsaid = bundle.avoid.find((a) => a.code === 'nsaid')!;
    expect(nsaid.conditions.sort()).toEqual(['asthma', 'ckd']);
    expect(nsaid.rationale).toHaveLength(2);
  });
});

describe('buildBundleFromConditions — conflicts', () => {
  it('flags class that is required by one condition and avoided by another (DM2 metformin vs CKD avoid)', () => {
    const bundle = buildBundleFromConditions(['dm2', 'ckd']);
    const conflict = bundle.conflicts.find((c) => c.code === 'metformin');
    expect(conflict).toBeDefined();
    expect(conflict!.requiredBy).toContain('dm2');
    expect(conflict!.avoidedBy).toContain('ckd');
  });

  it('does NOT flag conflict when avoided class is not required elsewhere', () => {
    const bundle = buildBundleFromConditions(['ckd']);
    expect(bundle.conflicts).toEqual([]);
    expect(bundle.avoid.length).toBeGreaterThan(0);
  });

  it('does NOT flag conflict when only one condition is in play', () => {
    const bundle = buildBundleFromConditions(['hfref']);
    // HFrEF avoids NSAIDs; nothing else requires them in this bundle.
    expect(bundle.conflicts).toEqual([]);
  });
});

describe('buildBundleFromIcd10', () => {
  it('maps ICD-10 codes to conditions and skips unknowns', () => {
    const bundle = buildBundleFromIcd10(['I25', 'E11.9', 'Z00', '']);
    expect(bundle.conditions.sort()).toEqual(['cad', 'dm2']);
  });

  it('deduplicates conditions that map from multiple ICD-10 codes', () => {
    // I25 -> cad, I20 -> cad. Should only produce one cad entry.
    const bundle = buildBundleFromIcd10(['I25.10', 'I20.0']);
    expect(bundle.conditions).toEqual(['cad']);
  });

  it('produces a usable bundle for an empty input', () => {
    const bundle = buildBundleFromIcd10([]);
    expect(bundle.required).toEqual([]);
    expect(bundle.conditions).toEqual([]);
  });
});

describe('compose with computeCoverage', () => {
  it('feeds a custom bundle straight into computeCoverage', () => {
    const meds: MedicationDrugLink[] = [
      { medicationId: 'm-stat', drug: drug('d-stat', 'atorvastatin', 'statin') },
      { medicationId: 'm-asa', drug: drug('d-asa', 'aspirin', 'antiplatelet') },
      { medicationId: 'm-met', drug: drug('d-met', 'metoprolol', 'beta blocker') },
      { medicationId: 'm-lis', drug: drug('d-lis', 'lisinopril', 'ace inhibitor') },
      { medicationId: 'm-metformin', drug: drug('d-metformin', 'metformin', 'biguanide') },
    ];
    const bundle = buildBundleFromConditions(['cad', 'dm2']);
    const report = computeCoverage(meds, bundle);
    // All required classes should be covered.
    expect(report.missing).toHaveLength(0);
    expect(report.coverageRatio).toBe(1);
  });

  it('surfaces missing classes when the regimen is incomplete', () => {
    const meds: MedicationDrugLink[] = [
      { medicationId: 'm-stat', drug: drug('d-stat', 'atorvastatin', 'statin') },
    ];
    const bundle = buildBundleFromConditions(['cad']);
    const report = computeCoverage(meds, bundle);
    expect(report.missing.length).toBeGreaterThanOrEqual(2);
  });
});

describe('summarizeBundle', () => {
  it('reports the empty case', () => {
    expect(summarizeBundle(buildBundleFromConditions([] as never))).toMatch(/No conditions/);
  });

  it('lists conditions in alphabetical order', () => {
    const bundle = buildBundleFromConditions(['dm2', 'cad']);
    const summary = summarizeBundle(bundle);
    expect(summary).toMatch(/Coronary artery disease/);
    expect(summary).toMatch(/Type 2 diabetes/);
    // Alphabetical: CAD label "Coronary..." comes before DM2 label "Type 2..."
    const cadIdx = summary.indexOf('Coronary');
    const dmIdx = summary.indexOf('Type 2');
    expect(cadIdx).toBeLessThan(dmIdx);
  });

  it('mentions conflict count when conflicts exist', () => {
    const bundle = buildBundleFromConditions(['dm2', 'ckd']);
    expect(summarizeBundle(bundle)).toMatch(/conflict/);
  });

  it('mentions avoid list when no conflicts but avoids present', () => {
    const bundle = buildBundleFromConditions(['ckd']);
    expect(summarizeBundle(bundle)).toMatch(/avoid list/);
  });
});

describe('classifyDrug + bundle composition end-to-end', () => {
  it('a CKD patient on NSAIDs has the avoid violation visible via classifyDrug', () => {
    const ibuprofen = drug('d-ibu', 'ibuprofen', 'NSAID');
    const classes = classifyDrug(ibuprofen);
    expect(classes).toContain('nsaid');
    const bundle = buildBundleFromConditions(['ckd']);
    expect(bundle.avoid.map((a) => a.code)).toContain('nsaid');
  });
});
