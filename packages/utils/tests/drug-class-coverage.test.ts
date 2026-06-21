import { describe, it, expect } from 'vitest';
import type { Drug } from '@med/types';
import {
  BUNDLES,
  classifyDrug,
  classifyRegimen,
  computeCoverage,
  summarizeCoverage,
  type MedicationDrugLink,
} from '../src/drug-class-coverage';

function drug(overrides: Partial<Drug>): Drug {
  return {
    id: overrides.id ?? 'd-1',
    generic: overrides.generic ?? 'lisinopril',
    brand: overrides.brand ?? 'Prinivil',
    class: overrides.class ?? 'ACE inhibitor',
    rxnormSample: overrides.rxnormSample ?? 0,
    indications: overrides.indications ?? [],
    dosages: overrides.dosages ?? [],
    routes: overrides.routes ?? ['oral'],
    frequencies: overrides.frequencies ?? ['daily'],
    interactions: overrides.interactions ?? [],
    warnings: overrides.warnings ?? [],
    pregnancyCategory: overrides.pregnancyCategory ?? 'C',
    storage: overrides.storage ?? 'room temp',
    sourceNote: overrides.sourceNote ?? 'test',
  };
}

function link(medicationId: string, d: Drug): MedicationDrugLink {
  return { medicationId, drug: d };
}

describe('classifyDrug', () => {
  it('classifies a statin by generic name', () => {
    expect(classifyDrug(drug({ generic: 'atorvastatin', class: 'HMG-CoA reductase inhibitor' }))).toEqual(['statin']);
  });
  it('classifies an ACE inhibitor across wording variants', () => {
    expect(classifyDrug(drug({ class: 'ACE-Inhibitor' }))).toEqual(['ace-inhibitor']);
    expect(classifyDrug(drug({ class: 'Angiotensin-Converting Enzyme Inhibitor' }))).toEqual(['ace-inhibitor']);
  });
  it('classifies aspirin as antiplatelet', () => {
    expect(classifyDrug(drug({ generic: 'aspirin', class: 'Salicylate' }))).toContain('antiplatelet');
  });
  it('classifies metformin', () => {
    expect(classifyDrug(drug({ generic: 'metformin', class: 'Biguanide' }))).toContain('metformin');
  });
  it('returns empty for a drug with no matching class', () => {
    expect(classifyDrug(drug({ generic: 'unobtainium', class: 'Unknown', brand: '' }))).toEqual([]);
  });
  it('catches multi-class combo drugs (e.g. amlodipine + ACE-I combo)', () => {
    const combo = drug({ generic: 'amlodipine + benazepril', class: 'Calcium-channel blocker / ACE inhibitor' });
    const classes = classifyDrug(combo);
    expect(classes).toContain('calcium-channel-blocker');
    expect(classes).toContain('ace-inhibitor');
  });
  it('classifies opioids', () => {
    expect(classifyDrug(drug({ generic: 'oxycodone', class: 'Opioid analgesic' }))).toContain('opioid');
  });
  it('classifies SSRIs', () => {
    expect(classifyDrug(drug({ generic: 'sertraline', class: 'SSRI' }))).toContain('ssri');
  });
  it('classifies SGLT2 inhibitors', () => {
    expect(classifyDrug(drug({ generic: 'empagliflozin', class: 'SGLT2 inhibitor' }))).toContain('sglt2-inhibitor');
  });
});

describe('classifyRegimen', () => {
  it('preserves medication id ordering', () => {
    const out = classifyRegimen([
      link('m1', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m2', drug({ generic: 'metformin', class: 'biguanide' })),
    ]);
    expect(out.map((c) => c.medicationId)).toEqual(['m1', 'm2']);
  });
});

describe('computeCoverage — CAD bundle', () => {
  const bundle = BUNDLES['cad-secondary-prevention']!;

  it('reports all four classes covered when full bundle present', () => {
    const regimen = [
      link('m-statin', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m-asa', drug({ generic: 'aspirin', class: 'antiplatelet' })),
      link('m-bb', drug({ generic: 'metoprolol', class: 'beta blocker' })),
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.covered).toHaveLength(4);
    expect(report.missing).toHaveLength(0);
    expect(report.coverageRatio).toBe(1);
    expect(report.duplicated).toHaveLength(0);
  });

  it('flags missing antiplatelet', () => {
    const regimen = [
      link('m-statin', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m-bb', drug({ generic: 'metoprolol', class: 'beta blocker' })),
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0]?.label).toBe('Antiplatelet');
    expect(report.coverageRatio).toBe(0.75);
  });

  it('accepts ARB as substitute for ACE inhibitor (anyOf)', () => {
    const regimen = [
      link('m-statin', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m-asa', drug({ generic: 'aspirin', class: 'antiplatelet' })),
      link('m-bb', drug({ generic: 'metoprolol', class: 'beta blocker' })),
      link('m-arb', drug({ generic: 'losartan', class: 'ARB' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.missing).toHaveLength(0);
    // The anyOf entry should be in covered.
    const anyOfEntry = report.covered.find((c) => c.anyOf);
    expect(anyOfEntry?.satisfiedBy).toEqual(['m-arb']);
  });

  it('flags duplicate statin in preferSingle', () => {
    const regimen = [
      link('m-statin1', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m-statin2', drug({ generic: 'simvastatin', class: 'statin' })),
      link('m-asa', drug({ generic: 'aspirin', class: 'antiplatelet' })),
      link('m-bb', drug({ generic: 'metoprolol', class: 'beta blocker' })),
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.duplicated).toHaveLength(1);
    expect(report.duplicated[0]?.code).toBe('statin');
    expect(report.duplicated[0]?.count).toBe(2);
    expect(report.duplicated[0]?.medicationIds).toEqual(['m-statin1', 'm-statin2']);
  });

  it('empty regimen reports all 4 missing', () => {
    const report = computeCoverage([], bundle);
    expect(report.missing).toHaveLength(4);
    expect(report.covered).toHaveLength(0);
    expect(report.coverageRatio).toBe(0);
  });
});

describe('computeCoverage — HFrEF bundle', () => {
  const bundle = BUNDLES['hfref']!;

  it('passes with ACE + beta blocker + SGLT2', () => {
    const regimen = [
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
      link('m-bb', drug({ generic: 'carvedilol', class: 'beta blocker' })),
      link('m-sglt2', drug({ generic: 'empagliflozin', class: 'SGLT2 inhibitor' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.missing).toHaveLength(0);
  });

  it('fails when SGLT2 absent', () => {
    const regimen = [
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
      link('m-bb', drug({ generic: 'carvedilol', class: 'beta blocker' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0]?.label).toContain('SGLT2');
  });
});

describe('computeCoverage — COPD bundle', () => {
  const bundle = BUNDLES['copd']!;

  it('passes with LABA + SABA', () => {
    const regimen = [
      link('m-laba', drug({ generic: 'salmeterol', class: 'LABA' })),
      link('m-saba', drug({ generic: 'albuterol', class: 'SABA' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.missing).toHaveLength(0);
  });

  it('flags missing rescue inhaler (SABA)', () => {
    const regimen = [
      link('m-laba', drug({ generic: 'salmeterol', class: 'LABA' })),
    ];
    const report = computeCoverage(regimen, bundle);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0]?.label).toContain('SABA');
  });
});

describe('computeCoverage — custom bundle', () => {
  it('honors a user-provided bundle definition', () => {
    const bundle = {
      id: 'osa-cpap-meds',
      label: 'OSA + GERD bundle',
      required: [{ code: 'ppi' as const, rationale: 'GERD control improves CPAP tolerance.' }],
    };
    const regimen = [link('m-ppi', drug({ generic: 'omeprazole', class: 'PPI' }))];
    expect(computeCoverage(regimen, bundle).coverageRatio).toBe(1);
    expect(computeCoverage([], bundle).coverageRatio).toBe(0);
  });
});

describe('summarizeCoverage', () => {
  const bundle = BUNDLES['cad-secondary-prevention']!;

  it('lists missing classes in the summary', () => {
    const regimen = [link('m-statin', drug({ generic: 'atorvastatin', class: 'statin' }))];
    const summary = summarizeCoverage(computeCoverage(regimen, bundle));
    expect(summary).toContain('CAD secondary prevention: 1 of 4 classes covered');
    expect(summary).toContain('missing: Antiplatelet');
  });

  it('returns clean message when fully covered', () => {
    const regimen = [
      link('m-statin', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m-asa', drug({ generic: 'aspirin', class: 'antiplatelet' })),
      link('m-bb', drug({ generic: 'metoprolol', class: 'beta blocker' })),
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
    ];
    const summary = summarizeCoverage(computeCoverage(regimen, bundle));
    expect(summary).toBe('CAD secondary prevention: 4 of 4 classes covered.');
  });

  it('reports duplicates when present and no misses', () => {
    const regimen = [
      link('m-statin1', drug({ generic: 'atorvastatin', class: 'statin' })),
      link('m-statin2', drug({ generic: 'simvastatin', class: 'statin' })),
      link('m-asa', drug({ generic: 'aspirin', class: 'antiplatelet' })),
      link('m-bb', drug({ generic: 'metoprolol', class: 'beta blocker' })),
      link('m-ace', drug({ generic: 'lisinopril', class: 'ACE inhibitor' })),
    ];
    const summary = summarizeCoverage(computeCoverage(regimen, bundle));
    expect(summary).toContain('duplicated: Statin x2');
  });
});
