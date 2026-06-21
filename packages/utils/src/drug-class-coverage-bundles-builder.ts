/**
 * Custom bundle builder for drug-class coverage from ICD-10 codes.
 *
 * `drug-class-coverage.ts` ships 4 curated bundles (CAD secondary
 * prevention, HFrEF, DM2, COPD) that are great defaults — but real
 * patients arrive with a SPECIFIC problem list. A patient diagnosed
 * with both CAD AND DM2 needs the union of their bundles; a patient
 * with chronic kidney disease should NOT have NSAIDs in their
 * expected list and should have an ARB rather than ACE-I (kidney-
 * protective). The dashboard's "what's missing" check is only useful
 * if the bundle reflects the patient's actual conditions.
 *
 * This module:
 *
 *   1. Maps ICD-10 codes to a CONDITION (e.g. I25 -> 'cad', E11 ->
 *      'dm2', I50.4* -> 'hfref'). ICD-10 is hierarchical; we match
 *      on prefix so I50.40 / I50.41 / I50.42 all route to hfref.
 *   2. Each condition contributes class expectations (required
 *      classes, anyOf groups, preferSingle hints, AVOID classes).
 *   3. The builder composes the union of expectations across the
 *      patient's condition codes, deduplicating by class code while
 *      respecting AVOID rules (a class that's required by one
 *      condition AND avoided by another goes to a "conflict" list
 *      surfaced to the prescriber).
 *
 * The condition table is curated and intentionally narrow — clinical
 * guideline drift is real and any new condition should be added with
 * a cited rationale string. Substring/prefix matching is the simplest
 * thing that works for ICD-10's hierarchical structure.
 *
 * Pure / deterministic. No I/O. Composes with drug-class-coverage.
 */

import type {
  BundleExpectation,
  DrugClassCode,
} from './drug-class-coverage';

export type ConditionCode =
  | 'cad'
  | 'hfref'
  | 'dm2'
  | 'copd'
  | 'asthma'
  | 'ckd'
  | 'mdd'
  | 'gerd'
  | 'afib'
  | 'htn';

export interface ConditionDefinition {
  code: ConditionCode;
  label: string;
  /** ICD-10 code prefixes that route to this condition. Lower-cased. */
  icd10Prefixes: string[];
  /**
   * Required class expectations. Same shape as BundleExpectation.required.
   */
  required: { code?: DrugClassCode; anyOf?: DrugClassCode[]; rationale: string }[];
  /** Classes that should ideally appear at most once. */
  preferSingle?: DrugClassCode[];
  /**
   * Classes that are CONTRAINDICATED in this condition (e.g. NSAIDs
   * in CKD). When the patient's regimen contains an avoided class,
   * the bundle surfaces it as an `avoidViolations` entry.
   */
  avoid?: { code: DrugClassCode; rationale: string }[];
}

/**
 * Curated condition table. Cited rationales come from common
 * primary-care guideline summaries; the table is intentionally
 * conservative.
 */
export const CONDITIONS: ConditionDefinition[] = [
  {
    code: 'cad',
    label: 'Coronary artery disease',
    icd10Prefixes: ['i25', 'i20', 'i21', 'i22'],
    required: [
      { code: 'statin', rationale: 'LDL lowering reduces recurrent events.' },
      { code: 'antiplatelet', rationale: 'Aspirin or P2Y12 inhibitor reduces thrombotic events.' },
      { code: 'beta-blocker', rationale: 'Beta blockade post-MI improves survival.' },
      { anyOf: ['ace-inhibitor', 'arb'], rationale: 'RAAS blockade for LV remodeling and BP control.' },
    ],
    preferSingle: ['statin', 'antiplatelet', 'beta-blocker'],
  },
  {
    code: 'hfref',
    label: 'Heart failure with reduced EF',
    icd10Prefixes: ['i50.2', 'i50.4'],
    required: [
      { anyOf: ['ace-inhibitor', 'arb'], rationale: 'RAAS blockade is foundational.' },
      { code: 'beta-blocker', rationale: 'Mortality benefit in HFrEF.' },
      { code: 'sglt2-inhibitor', rationale: 'Reduces HF hospitalization and mortality.' },
    ],
    preferSingle: ['beta-blocker'],
    avoid: [
      { code: 'nsaid', rationale: 'NSAIDs precipitate decompensation in HFrEF.' },
    ],
  },
  {
    code: 'dm2',
    label: 'Type 2 diabetes',
    icd10Prefixes: ['e11'],
    required: [
      { code: 'metformin', rationale: 'First-line glucose lowering unless contraindicated.' },
    ],
    preferSingle: ['metformin', 'sglt2-inhibitor', 'glp1-agonist'],
  },
  {
    code: 'copd',
    label: 'COPD',
    icd10Prefixes: ['j44'],
    required: [
      { anyOf: ['laba', 'lama'], rationale: 'Long-acting bronchodilator for daily symptom control.' },
      { code: 'saba', rationale: 'Rescue inhaler for breakthrough symptoms.' },
    ],
    preferSingle: ['laba', 'lama'],
    avoid: [
      { code: 'benzodiazepine', rationale: 'Benzodiazepines blunt respiratory drive in COPD.' },
    ],
  },
  {
    code: 'asthma',
    label: 'Asthma',
    icd10Prefixes: ['j45'],
    required: [
      { code: 'inhaled-corticosteroid', rationale: 'Daily controller for persistent asthma.' },
      { code: 'saba', rationale: 'Rescue inhaler for acute symptoms.' },
    ],
    avoid: [
      { code: 'nsaid', rationale: 'NSAIDs trigger bronchospasm in aspirin-sensitive asthma.' },
    ],
  },
  {
    code: 'ckd',
    label: 'Chronic kidney disease',
    icd10Prefixes: ['n18'],
    required: [
      { anyOf: ['ace-inhibitor', 'arb'], rationale: 'Renoprotection in proteinuric CKD.' },
    ],
    avoid: [
      { code: 'nsaid', rationale: 'NSAIDs cause AKI in established CKD.' },
      { code: 'metformin', rationale: 'Metformin is contraindicated below eGFR ~30; review renal dose.' },
    ],
  },
  {
    code: 'mdd',
    label: 'Major depressive disorder',
    icd10Prefixes: ['f32', 'f33'],
    required: [
      { anyOf: ['ssri', 'snri'], rationale: 'First-line pharmacotherapy for moderate-severe MDD.' },
    ],
    preferSingle: ['ssri', 'snri'],
    avoid: [
      { code: 'maoi', rationale: 'Avoid concomitant MAOI without strict serotonergic washout.' },
    ],
  },
  {
    code: 'gerd',
    label: 'Gastroesophageal reflux',
    icd10Prefixes: ['k21'],
    required: [
      { anyOf: ['ppi', 'h2-blocker'], rationale: 'Acid suppression first-line for symptom control.' },
    ],
    preferSingle: ['ppi'],
  },
  {
    code: 'afib',
    label: 'Atrial fibrillation',
    icd10Prefixes: ['i48'],
    required: [
      { code: 'anticoagulant', rationale: 'Stroke prevention based on CHA2DS2-VASc score.' },
      { anyOf: ['beta-blocker', 'calcium-channel-blocker'], rationale: 'Rate control.' },
    ],
    preferSingle: ['anticoagulant'],
  },
  {
    code: 'htn',
    label: 'Hypertension',
    icd10Prefixes: ['i10'],
    required: [
      {
        anyOf: ['thiazide', 'ace-inhibitor', 'arb', 'calcium-channel-blocker'],
        rationale: 'First-line single agent per JNC8 / ACC-AHA tiered preference.',
      },
    ],
  },
];

const CONDITIONS_BY_CODE = new Map<ConditionCode, ConditionDefinition>(
  CONDITIONS.map((c) => [c.code, c]),
);

export interface AvoidViolation {
  /** Class that violates a condition's avoid list. */
  code: DrugClassCode;
  /** Conditions whose avoid lists are violated. */
  conditions: ConditionCode[];
  rationale: string[];
}

export interface BundleConflict {
  /** Class that is both required by one condition and avoided by another. */
  code: DrugClassCode;
  requiredBy: ConditionCode[];
  avoidedBy: ConditionCode[];
}

export interface CustomBundle extends BundleExpectation {
  /** Source conditions composed into this bundle. */
  conditions: ConditionCode[];
  /** Avoid rules collected from the source conditions. */
  avoid: AvoidViolation[];
  /** Classes that have a required-vs-avoid conflict across conditions. */
  conflicts: BundleConflict[];
}

/**
 * Normalize an ICD-10 code: lower-case and strip leading/trailing
 * whitespace. Decimal points are preserved (the prefix table uses
 * 'i50.4' to distinguish HFrEF from HFpEF).
 */
function normalize(icd: string): string {
  return icd.trim().toLowerCase();
}

/**
 * Resolve an ICD-10 code to a ConditionCode using prefix match. The
 * first condition whose prefix list contains a match wins; order is
 * the declaration order in `CONDITIONS`. Returns null when no
 * condition matches.
 */
export function conditionForIcd10(icd: string): ConditionCode | null {
  const code = normalize(icd);
  if (!code) return null;
  for (const cond of CONDITIONS) {
    if (cond.icd10Prefixes.some((p) => code.startsWith(p))) return cond.code;
  }
  return null;
}

/**
 * Build a custom BundleExpectation from a set of ICD-10 codes or
 * pre-resolved ConditionCode values. The result composes with
 * computeCoverage(meds, bundle) directly.
 *
 * Composition rules:
 *
 *   - REQUIRED classes from every contributing condition union into
 *     the bundle's required list. An `anyOf` group is preserved as
 *     a single entry per source condition (so the rationales for
 *     "ACE-I or ARB" from CAD and from CKD both appear).
 *   - preferSingle classes union.
 *   - AVOID classes are collected separately as `avoid`. A class
 *     that is ALSO required by another condition produces a
 *     `conflicts` entry — the bundle leaves the required intact
 *     (the prescriber decides) but flags it.
 */
export function buildBundleFromConditions(
  input: string[] | ConditionCode[],
  bundleId?: string,
): CustomBundle {
  const conditions: ConditionCode[] = [];
  const seen = new Set<ConditionCode>();
  for (const item of input) {
    const code = (CONDITIONS_BY_CODE.has(item as ConditionCode)
      ? (item as ConditionCode)
      : conditionForIcd10(item)) as ConditionCode | null;
    if (!code) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    conditions.push(code);
  }
  conditions.sort();

  const required: BundleExpectation['required'] = [];
  const preferSingleSet = new Set<DrugClassCode>();
  const avoidByCode = new Map<DrugClassCode, AvoidViolation>();
  const requiredByCode = new Map<DrugClassCode, Set<ConditionCode>>();

  for (const condCode of conditions) {
    const cond = CONDITIONS_BY_CODE.get(condCode)!;
    for (const req of cond.required) {
      required.push(req);
      const codes = req.code ? [req.code] : req.anyOf ?? [];
      for (const c of codes) {
        if (!requiredByCode.has(c)) requiredByCode.set(c, new Set());
        requiredByCode.get(c)!.add(condCode);
      }
    }
    for (const p of cond.preferSingle ?? []) preferSingleSet.add(p);
    for (const a of cond.avoid ?? []) {
      const entry = avoidByCode.get(a.code) ?? {
        code: a.code,
        conditions: [],
        rationale: [],
      };
      if (!entry.conditions.includes(condCode)) entry.conditions.push(condCode);
      entry.rationale.push(a.rationale);
      avoidByCode.set(a.code, entry);
    }
  }

  // Conflicts: a class appears in BOTH the union-of-required and the
  // union-of-avoid.
  const conflicts: BundleConflict[] = [];
  for (const [code, avoidEntry] of avoidByCode) {
    const reqs = requiredByCode.get(code);
    if (reqs && reqs.size > 0) {
      conflicts.push({
        code,
        requiredBy: [...reqs].sort(),
        avoidedBy: [...avoidEntry.conditions].sort(),
      });
    }
  }
  conflicts.sort((a, b) => a.code.localeCompare(b.code));

  const conditionLabels = conditions
    .map((c) => CONDITIONS_BY_CODE.get(c)!.label)
    .sort();

  const id = bundleId
    ? bundleId
    : conditions.length > 0
      ? `custom-${conditions.join('-')}`
      : 'custom-empty';
  const label = conditions.length > 0
    ? `Custom bundle: ${conditionLabels.join(' + ')}`
    : 'Custom bundle: no conditions';

  return {
    id,
    label,
    required,
    preferSingle: [...preferSingleSet].sort(),
    conditions,
    avoid: [...avoidByCode.values()].sort((a, b) => a.code.localeCompare(b.code)),
    conflicts,
  };
}

/**
 * Convenience: build a bundle from a flat list of ICD-10 codes
 * (typical EHR problem list export). Codes that don't map to a
 * known condition are silently skipped — callers can compare
 * `result.conditions.length` to the input length to detect drops.
 */
export function buildBundleFromIcd10(codes: string[]): CustomBundle {
  return buildBundleFromConditions(codes);
}

/**
 * Headline string:
 *   "Custom bundle: CAD + DM2 + CKD with 1 conflict (NSAIDs avoided in CKD)."
 */
export function summarizeBundle(bundle: CustomBundle): string {
  if (bundle.conditions.length === 0) return 'No conditions mapped.';
  const labels = bundle.conditions
    .map((c) => CONDITIONS_BY_CODE.get(c)?.label ?? c)
    .sort()
    .join(' + ');
  const head = `Bundle for ${labels}`;
  if (bundle.conflicts.length > 0) {
    return `${head} (${bundle.conflicts.length} conflict${bundle.conflicts.length === 1 ? '' : 's'}).`;
  }
  if (bundle.avoid.length > 0) {
    return `${head}; ${bundle.avoid.length} class${bundle.avoid.length === 1 ? '' : 'es'} on the avoid list.`;
  }
  return `${head}.`;
}
