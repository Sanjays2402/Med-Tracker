/**
 * Drug-class coverage check across the regimen.
 *
 * Caregivers and primary-care prescribers regularly ask the inverse
 * question of "what meds is this patient on?" — they want to see what
 * is MISSING from a typical bundle for a given condition. For
 * example, a patient with documented coronary artery disease should
 * usually be on:
 *
 *   - a statin (LDL lowering),
 *   - an antiplatelet (aspirin or clopidogrel),
 *   - a beta blocker if post-MI,
 *   - an ACE inhibitor or ARB if reduced ejection fraction or diabetic.
 *
 * If the patient is on a statin + ACE-inhibitor but no antiplatelet,
 * the dashboard should surface "Antiplatelet missing — review with
 * cardiology." Conversely, a regimen with two statins is a
 * double-class situation that should be flagged for de-prescribing.
 *
 * This module:
 *
 *   1. Classifies each medication into one of ~14 cardiometabolic /
 *      neurological / respiratory drug classes using substring matches
 *      against `Drug.class`, `Drug.generic`, and `Drug.warnings`.
 *      Substring match keeps it robust to "ACE inhibitor" vs
 *      "Angiotensin-Converting Enzyme Inhibitor" wording variants.
 *   2. Given a bundle expectation (e.g. CAD_SECONDARY_PREVENTION),
 *      returns which classes are present, missing, or duplicated.
 *   3. Exposes a small, opinionated set of named bundles (CAD, HFrEF,
 *      DM2, COPD) — the user can also pass a custom bundle.
 *
 * The classifier is intentionally conservative: missing-class warnings
 * are NEVER medical advice; they exist so the UI can prompt the user
 * to ask the prescriber. Curated rules only — no inference.
 *
 * Pure / deterministic. No I/O.
 */

import type { Drug } from '@med/types';

export type DrugClassCode =
  | 'statin'
  | 'antiplatelet'
  | 'anticoagulant'
  | 'beta-blocker'
  | 'ace-inhibitor'
  | 'arb'
  | 'calcium-channel-blocker'
  | 'thiazide'
  | 'loop-diuretic'
  | 'metformin'
  | 'sglt2-inhibitor'
  | 'glp1-agonist'
  | 'insulin'
  | 'ppi'
  | 'h2-blocker'
  | 'ssri'
  | 'snri'
  | 'maoi'
  | 'benzodiazepine'
  | 'opioid'
  | 'inhaled-corticosteroid'
  | 'laba'
  | 'saba'
  | 'lama'
  | 'nsaid';

interface ClassDefinition {
  code: DrugClassCode;
  /** Lower-cased substrings tried against drug.class / generic / brand. */
  matchers: string[];
  /** Human label for UI surfacing. */
  label: string;
}

const CLASS_DEFINITIONS: ClassDefinition[] = [
  { code: 'statin', label: 'Statin', matchers: ['statin', 'simvastatin', 'atorvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin', 'fluvastatin', 'pitavastatin'] },
  { code: 'antiplatelet', label: 'Antiplatelet', matchers: ['antiplatelet', 'clopidogrel', 'ticagrelor', 'prasugrel', 'aspirin', 'asa 81', 'low-dose aspirin'] },
  { code: 'anticoagulant', label: 'Anticoagulant', matchers: ['anticoagulant', 'warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'enoxaparin', 'heparin'] },
  { code: 'beta-blocker', label: 'Beta blocker', matchers: ['beta blocker', 'beta-blocker', 'metoprolol', 'atenolol', 'carvedilol', 'bisoprolol', 'propranolol', 'nebivolol', 'labetalol'] },
  { code: 'ace-inhibitor', label: 'ACE inhibitor', matchers: ['ace inhibitor', 'ace-inhibitor', 'lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril', 'quinapril', 'perindopril'] },
  { code: 'arb', label: 'ARB', matchers: ['arb', 'angiotensin receptor blocker', 'losartan', 'valsartan', 'olmesartan', 'irbesartan', 'candesartan', 'telmisartan'] },
  { code: 'calcium-channel-blocker', label: 'Calcium-channel blocker', matchers: ['calcium channel blocker', 'calcium-channel blocker', 'amlodipine', 'diltiazem', 'verapamil', 'nifedipine', 'felodipine'] },
  { code: 'thiazide', label: 'Thiazide diuretic', matchers: ['thiazide', 'hydrochlorothiazide', 'hctz', 'chlorthalidone', 'indapamide', 'metolazone'] },
  { code: 'loop-diuretic', label: 'Loop diuretic', matchers: ['loop diuretic', 'furosemide', 'bumetanide', 'torsemide', 'ethacrynic'] },
  { code: 'metformin', label: 'Metformin', matchers: ['metformin', 'biguanide'] },
  { code: 'sglt2-inhibitor', label: 'SGLT2 inhibitor', matchers: ['sglt2', 'empagliflozin', 'dapagliflozin', 'canagliflozin', 'ertugliflozin'] },
  { code: 'glp1-agonist', label: 'GLP-1 agonist', matchers: ['glp-1', 'glp1', 'semaglutide', 'liraglutide', 'dulaglutide', 'tirzepatide', 'exenatide'] },
  { code: 'insulin', label: 'Insulin', matchers: ['insulin', 'glargine', 'detemir', 'aspart', 'lispro', 'degludec'] },
  { code: 'ppi', label: 'Proton-pump inhibitor', matchers: ['ppi', 'proton pump inhibitor', 'omeprazole', 'pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole', 'dexlansoprazole'] },
  { code: 'h2-blocker', label: 'H2 blocker', matchers: ['h2 blocker', 'h2-blocker', 'famotidine', 'ranitidine', 'cimetidine', 'nizatidine'] },
  { code: 'ssri', label: 'SSRI', matchers: ['ssri', 'sertraline', 'fluoxetine', 'paroxetine', 'citalopram', 'escitalopram', 'fluvoxamine'] },
  { code: 'snri', label: 'SNRI', matchers: ['snri', 'venlafaxine', 'duloxetine', 'desvenlafaxine', 'milnacipran'] },
  { code: 'maoi', label: 'MAOI', matchers: ['maoi', 'phenelzine', 'tranylcypromine', 'isocarboxazid', 'selegiline'] },
  { code: 'benzodiazepine', label: 'Benzodiazepine', matchers: ['benzodiazepine', 'alprazolam', 'lorazepam', 'diazepam', 'clonazepam', 'temazepam', 'midazolam'] },
  { code: 'opioid', label: 'Opioid', matchers: ['opioid', 'oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'oxymorphone', 'hydromorphone', 'methadone', 'tapentadol'] },
  { code: 'inhaled-corticosteroid', label: 'Inhaled corticosteroid (ICS)', matchers: ['inhaled corticosteroid', 'fluticasone', 'budesonide', 'mometasone', 'beclomethasone', 'ciclesonide'] },
  { code: 'laba', label: 'Long-acting beta agonist (LABA)', matchers: ['laba', 'salmeterol', 'formoterol', 'vilanterol', 'olodaterol', 'indacaterol'] },
  { code: 'saba', label: 'Short-acting beta agonist (SABA)', matchers: ['saba', 'albuterol', 'salbutamol', 'levalbuterol', 'terbutaline'] },
  { code: 'lama', label: 'Long-acting muscarinic (LAMA)', matchers: ['lama', 'tiotropium', 'umeclidinium', 'aclidinium', 'glycopyrrolate', 'glycopyrronium'] },
  { code: 'nsaid', label: 'NSAID', matchers: ['nsaid', 'ibuprofen', 'naproxen', 'celecoxib', 'meloxicam', 'diclofenac', 'ketorolac', 'indomethacin'] },
];

const LABEL_BY_CODE = new Map<DrugClassCode, string>(CLASS_DEFINITIONS.map((d) => [d.code, d.label]));

export interface BundleExpectation {
  /** Stable bundle id, e.g. 'cad-secondary-prevention'. */
  id: string;
  /** Human-readable name, e.g. 'CAD secondary prevention'. */
  label: string;
  /**
   * Required classes — at least one of EACH must be present in the
   * regimen. ACE/ARB equivalence is handled by listing both as
   * `anyOf` instead of two separate requirements.
   */
  required: { code?: DrugClassCode; anyOf?: DrugClassCode[]; rationale: string }[];
  /** Classes that should ideally appear at most once. */
  preferSingle?: DrugClassCode[];
}

/** Curated bundles for common chronic conditions. */
export const BUNDLES: Record<string, BundleExpectation> = {
  'cad-secondary-prevention': {
    id: 'cad-secondary-prevention',
    label: 'CAD secondary prevention',
    required: [
      { code: 'statin', rationale: 'LDL lowering reduces recurrent events.' },
      { code: 'antiplatelet', rationale: 'Aspirin or P2Y12 inhibitor reduces thrombotic events.' },
      { code: 'beta-blocker', rationale: 'Beta blockade post-MI improves survival.' },
      { anyOf: ['ace-inhibitor', 'arb'], rationale: 'RAAS blockade for LV remodeling and BP control.' },
    ],
    preferSingle: ['statin', 'antiplatelet', 'beta-blocker'],
  },
  'hfref': {
    id: 'hfref',
    label: 'Heart failure with reduced EF',
    required: [
      { anyOf: ['ace-inhibitor', 'arb'], rationale: 'RAAS blockade is foundational.' },
      { code: 'beta-blocker', rationale: 'Mortality benefit in HFrEF.' },
      { code: 'sglt2-inhibitor', rationale: 'Reduces HF hospitalization and mortality.' },
    ],
    preferSingle: ['beta-blocker'],
  },
  'dm2': {
    id: 'dm2',
    label: 'Type 2 diabetes',
    required: [
      { code: 'metformin', rationale: 'First-line glucose lowering unless contraindicated.' },
    ],
    preferSingle: ['metformin', 'sglt2-inhibitor', 'glp1-agonist'],
  },
  'copd': {
    id: 'copd',
    label: 'COPD',
    required: [
      { anyOf: ['laba', 'lama'], rationale: 'Long-acting bronchodilator for daily symptom control.' },
      { code: 'saba', rationale: 'Rescue inhaler for breakthrough symptoms.' },
    ],
    preferSingle: ['laba', 'lama'],
  },
};

export interface DrugClassification {
  medicationId: string;
  classes: DrugClassCode[];
}

export interface CoverageEntry {
  code?: DrugClassCode;
  anyOf?: DrugClassCode[];
  label: string;
  rationale: string;
  present: boolean;
  /** Medication ids that satisfy this requirement. */
  satisfiedBy: string[];
}

export interface DuplicateEntry {
  code: DrugClassCode;
  label: string;
  count: number;
  medicationIds: string[];
}

export interface CoverageReport {
  bundle: BundleExpectation;
  classified: DrugClassification[];
  covered: CoverageEntry[];
  missing: CoverageEntry[];
  duplicated: DuplicateEntry[];
  /** Fraction in [0, 1] of required entries that are satisfied. */
  coverageRatio: number;
}

function lower(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

/**
 * Classify a single drug into zero, one, or more class codes. A drug
 * may belong to more than one class (a thiazide-ACE combo pill counts
 * as both). Substring matching is intentionally loose so wording
 * variants in `drug.class` ("ACE-Inhibitor", "ACE inhibitor",
 * "Angiotensin-Converting Enzyme Inhibitor") all classify.
 */
export function classifyDrug(drug: Drug): DrugClassCode[] {
  const haystack = [
    lower(drug.class),
    lower(drug.generic),
    lower(drug.brand),
    ...(drug.warnings ?? []).map(lower),
    ...(drug.interactions ?? []).map(lower),
  ];
  const out: DrugClassCode[] = [];
  for (const def of CLASS_DEFINITIONS) {
    if (def.matchers.some((m) => haystack.some((h) => h.includes(m)))) {
      out.push(def.code);
    }
  }
  return out;
}

export interface MedicationDrugLink {
  medicationId: string;
  drug: Drug;
}

/** Classify each medication in the regimen. Order is preserved. */
export function classifyRegimen(meds: MedicationDrugLink[]): DrugClassification[] {
  return meds.map((m) => ({ medicationId: m.medicationId, classes: classifyDrug(m.drug) }));
}

function findSatisfiers(
  classified: DrugClassification[],
  codes: DrugClassCode[],
): string[] {
  const out = new Set<string>();
  for (const item of classified) {
    if (item.classes.some((c) => codes.includes(c))) out.add(item.medicationId);
  }
  return [...out].sort();
}

/**
 * Compute a coverage report for the regimen against the bundle.
 *
 * Missing entries list which classes are absent and a rationale so the
 * UI can render "Antiplatelet missing — Aspirin or P2Y12 inhibitor
 * reduces thrombotic events." Duplicated entries list classes that
 * appear in more than one medication AND are flagged in the bundle's
 * `preferSingle` list (so e.g. two SSRIs flag, but two opioids do
 * not unless the bundle explicitly asks).
 */
export function computeCoverage(
  meds: MedicationDrugLink[],
  bundle: BundleExpectation,
): CoverageReport {
  const classified = classifyRegimen(meds);
  const covered: CoverageEntry[] = [];
  const missing: CoverageEntry[] = [];

  for (const req of bundle.required) {
    const codes = req.code ? [req.code] : req.anyOf ?? [];
    const label = codes
      .map((c) => LABEL_BY_CODE.get(c) ?? c)
      .join(' or ');
    const satisfiers = findSatisfiers(classified, codes);
    const entry: CoverageEntry = {
      code: req.code,
      anyOf: req.anyOf,
      label,
      rationale: req.rationale,
      present: satisfiers.length > 0,
      satisfiedBy: satisfiers,
    };
    if (entry.present) covered.push(entry);
    else missing.push(entry);
  }

  const duplicated: DuplicateEntry[] = [];
  const watch = bundle.preferSingle ?? [];
  for (const code of watch) {
    const ids = findSatisfiers(classified, [code]);
    if (ids.length > 1) {
      duplicated.push({
        code,
        label: LABEL_BY_CODE.get(code) ?? code,
        count: ids.length,
        medicationIds: ids,
      });
    }
  }
  duplicated.sort((a, b) => a.label.localeCompare(b.label));

  const totalReq = bundle.required.length;
  const coverageRatio = totalReq === 0 ? 1 : covered.length / totalReq;

  return { bundle, classified, covered, missing, duplicated, coverageRatio };
}

/**
 * One-line headline:
 *   "CAD secondary prevention: 3 of 4 classes covered (missing: Antiplatelet)."
 */
export function summarizeCoverage(report: CoverageReport): string {
  const total = report.covered.length + report.missing.length;
  const head = `${report.bundle.label}: ${report.covered.length} of ${total} class${total === 1 ? '' : 'es'} covered`;
  if (report.missing.length === 0) {
    if (report.duplicated.length > 0) {
      const dups = report.duplicated.map((d) => `${d.label} x${d.count}`).join(', ');
      return `${head} (duplicated: ${dups}).`;
    }
    return `${head}.`;
  }
  const miss = report.missing.map((m) => m.label).join(', ');
  return `${head} (missing: ${miss}).`;
}
