/**
 * Interaction time-spacer.
 *
 * Some drug-drug interactions are mitigated — not avoided — by
 * spacing the doses in time. Classic clinical examples:
 *
 *   - Levothyroxine + calcium or iron: 4-hour gap to avoid chelation.
 *   - Tetracyclines + antacids / dairy: 2-hour gap before or 4-hour
 *     gap after the antacid.
 *   - Fluoroquinolones + multivalent cations (Ca/Mg/Al/Fe/Zn): 2-hour
 *     gap before or 6-hour gap after.
 *   - Bisphosphonates + food or any oral drug: 30 minutes upright,
 *     fasting.
 *   - Bile-acid sequestrants (cholestyramine) + most oral meds:
 *     1-hour before or 4-hours after.
 *
 * The interaction-severity classifier flags THAT a problem exists;
 * this module says HOW LONG to wait between the two doses to keep the
 * absorption window safe, and — given a patient's actual schedules —
 * which pairs of dose times violate the gap.
 *
 * Curated rules only. No medical guidance is invented from keyword
 * overlap; if a pair has no curated rule the spacer returns null and
 * the caller falls back to the generic "review with pharmacist"
 * pattern.
 *
 * Pure / deterministic. No I/O.
 */

import type { Drug, Schedule } from '@med/types';
import { expandSchedule } from './schedule';
import { addDays, startOfDay } from './date';

export interface TimingRule {
  /** Stable rule id, surfaced in results. */
  rule: string;
  /** Lower-cased substrings matched against drug.generic / class / brand. */
  a: string[];
  /** Lower-cased substrings matched against drug.generic / class / brand. */
  b: string[];
  /**
   * Minimum gap in minutes between an `a` dose and a `b` dose to
   * avoid the interaction. Applied symmetrically — see
   * `gapDirection` to express asymmetric rules.
   */
  minGapMinutes: number;
  /**
   * 'symmetric' (default) — the gap applies whichever drug comes
   * first.
   * 'a-before-b' — `a` must come first; if `b` is first the gap is
   * doubled (the directional rule for cation-binding antibiotics).
   */
  gapDirection?: 'symmetric' | 'a-before-b';
  mechanism: string;
  action: string;
}

/**
 * Curated timing rules. Substring match against the same hay-stack
 * as interaction-severity (drug.generic / class / brand / warnings).
 */
export const TIMING_RULES: TimingRule[] = [
  {
    rule: 'levothyroxine-cation',
    a: ['levothyroxine', 'liothyronine', 'thyroid'],
    b: ['calcium', 'iron', 'ferrous', 'magnesium', 'aluminum', 'antacid', 'cholestyramine', 'sevelamer', 'sucralfate'],
    minGapMinutes: 240,
    gapDirection: 'a-before-b',
    mechanism:
      'Multivalent cations and bile-acid sequestrants bind levothyroxine in the gut and reduce absorption.',
    action: 'Take levothyroxine on an empty stomach at least 4 hours before any cation or binder.',
  },
  {
    rule: 'tetracycline-cation',
    a: ['tetracycline', 'doxycycline', 'minocycline'],
    b: ['calcium', 'iron', 'ferrous', 'magnesium', 'aluminum', 'antacid', 'zinc', 'dairy'],
    minGapMinutes: 120,
    gapDirection: 'symmetric',
    mechanism: 'Multivalent cations chelate tetracyclines and block absorption.',
    action: 'Separate tetracycline and any cation-containing product by at least 2 hours.',
  },
  {
    rule: 'fluoroquinolone-cation',
    a: ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'fluoroquinolone'],
    b: ['calcium', 'iron', 'ferrous', 'magnesium', 'aluminum', 'antacid', 'zinc', 'sucralfate'],
    minGapMinutes: 120,
    gapDirection: 'a-before-b',
    mechanism: 'Multivalent cations chelate fluoroquinolones and block absorption.',
    action:
      'Take the fluoroquinolone 2 hours before or 6 hours after any cation; if cation must come first, double the gap.',
  },
  {
    rule: 'bisphosphonate-food',
    a: ['alendronate', 'risedronate', 'ibandronate', 'bisphosphonate'],
    b: ['calcium', 'iron', 'food', 'multivitamin', 'antacid', 'magnesium'],
    minGapMinutes: 60,
    gapDirection: 'a-before-b',
    mechanism: 'Bisphosphonates have poor bioavailability and any food or cation eliminates absorption.',
    action:
      'Take the bisphosphonate first thing in the morning with water only; wait at least 60 minutes upright before food or any other oral medication.',
  },
  {
    rule: 'cholestyramine-binders',
    a: ['cholestyramine', 'colestipol', 'colesevelam'],
    b: ['warfarin', 'thyroid', 'levothyroxine', 'digoxin', 'thiazide', 'statin'],
    minGapMinutes: 240,
    gapDirection: 'symmetric',
    mechanism: 'Bile-acid sequestrants bind many oral drugs in the gut.',
    action: 'Take other medications 1 hour before or 4 hours after the bile-acid sequestrant.',
  },
  {
    rule: 'ppi-antifungal-azole',
    a: ['ppi', 'omeprazole', 'pantoprazole', 'esomeprazole'],
    b: ['ketoconazole', 'itraconazole'],
    minGapMinutes: 120,
    gapDirection: 'symmetric',
    mechanism: 'PPIs raise gastric pH which reduces azole solubility and absorption.',
    action: 'Separate by at least 2 hours; consider taking the azole with an acidic beverage if PPI cannot be paused.',
  },
];

export interface TimingRequirement {
  /** Both drug ids in sorted order for stable keying. */
  drugIdA: string;
  drugIdB: string;
  /** The rule that matched. */
  rule: string;
  /** Minimum gap in minutes between the two drugs' dose times. */
  minGapMinutes: number;
  gapDirection: 'symmetric' | 'a-before-b';
  mechanism: string;
  action: string;
  /**
   * When gapDirection is 'a-before-b', this identifies which drug
   * is the `a` side (must come first). Equal to drugIdA or drugIdB.
   */
  primaryDrugId?: string;
}

const MS_MINUTE = 60_000;

function matchesSide(drug: Drug, terms: string[]): boolean {
  const hay = [
    drug.class,
    drug.generic,
    drug.brand,
    ...(drug.warnings ?? []),
    ...(drug.interactions ?? []),
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return terms.some((t) => hay.some((h) => h.includes(t)));
}

/**
 * Find every curated timing rule that applies to the pair. Returns
 * the rule with the LARGEST minGapMinutes when multiple match (the
 * caller wants the longest safe gap).
 */
export function findTimingRules(a: Drug, b: Drug): TimingRequirement[] {
  const out: TimingRequirement[] = [];
  for (const rule of TIMING_RULES) {
    const aSideA = matchesSide(a, rule.a) && matchesSide(b, rule.b);
    const aSideB = matchesSide(b, rule.a) && matchesSide(a, rule.b);
    if (!aSideA && !aSideB) continue;
    const direction = rule.gapDirection ?? 'symmetric';
    const primaryId = direction === 'a-before-b' ? (aSideA ? a.id : b.id) : undefined;
    const sorted = [a.id, b.id].sort();
    const drugIdA = sorted[0]!;
    const drugIdB = sorted[1]!;
    out.push({
      drugIdA,
      drugIdB,
      rule: rule.rule,
      minGapMinutes: rule.minGapMinutes,
      gapDirection: direction,
      mechanism: rule.mechanism,
      action: rule.action,
      primaryDrugId: primaryId,
    });
  }
  // Strongest (longest) rule first; tie-break alphabetic for stability.
  out.sort((x, y) =>
    y.minGapMinutes !== x.minGapMinutes
      ? y.minGapMinutes - x.minGapMinutes
      : x.rule.localeCompare(y.rule),
  );
  return out;
}

export interface MedicationScheduleInput {
  medicationId: string;
  drug: Drug;
  schedules: Schedule[];
}

export interface SpacingConflict {
  /** Sorted pair of medication ids. */
  medicationIdA: string;
  medicationIdB: string;
  rule: string;
  /** Local ISO timestamps of the offending dose pair. */
  doseAt: string;
  pairedDoseAt: string;
  /** Observed gap in minutes between the two doses. */
  observedGapMinutes: number;
  /** Required minimum gap. */
  requiredGapMinutes: number;
  /** Severity proportional to how far below the requirement we are. */
  severity: 'minor' | 'major';
  message: string;
}

export interface SpacingCheckOptions {
  /** Inclusive start of the schedule window. Default: today (local). */
  from?: Date;
  /** Inclusive end of the schedule window. Default: from + 7 days. */
  to?: Date;
  /**
   * Conflicts with observedGapMinutes / requiredGapMinutes >= this
   * ratio are classified as 'minor' instead of 'major'. Default 0.75
   * (within 75% of the required gap = minor).
   */
  minorRatio?: number;
}

function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${mi}`;
}

/**
 * For a pair of medications with timing requirements, expand each
 * medication's enabled schedules across the window and find every
 * dose-pair that violates the required gap.
 *
 * For 'a-before-b' rules, the patient is expected to take the primary
 * drug first; if a non-primary dose precedes the next primary dose,
 * the same minGap is required (the rule's clinical intent is
 * symmetric in that case but extra-strict when primary follows).
 */
export function detectSpacingConflicts(
  meds: MedicationScheduleInput[],
  options: SpacingCheckOptions = {},
): SpacingConflict[] {
  const from = startOfDay(options.from ?? new Date());
  const to = options.to ?? addDays(from, 7);
  const minorRatio = options.minorRatio ?? 0.75;

  // Precompute each medication's dose timestamps in the window.
  const doses = new Map<string, Date[]>();
  for (const m of meds) {
    const all: Date[] = [];
    for (const s of m.schedules) {
      if (!s.enabled) continue;
      all.push(...expandSchedule(s, from, to));
    }
    all.sort((x, y) => x.getTime() - y.getTime());
    doses.set(m.medicationId, all);
  }

  const conflicts: SpacingConflict[] = [];

  for (let i = 0; i < meds.length; i++) {
    for (let j = i + 1; j < meds.length; j++) {
      const A = meds[i]!;
      const B = meds[j]!;
      const rules = findTimingRules(A.drug, B.drug);
      if (rules.length === 0) continue;
      const strongest = rules[0]!;
      const required = strongest.minGapMinutes;
      const aDoses = doses.get(A.medicationId) ?? [];
      const bDoses = doses.get(B.medicationId) ?? [];

      // For every A dose, find the nearest B dose (closest in time).
      for (const aT of aDoses) {
        let bestB: Date | null = null;
        let bestGap = Infinity;
        for (const bT of bDoses) {
          const gap = Math.abs(bT.getTime() - aT.getTime()) / MS_MINUTE;
          if (gap < bestGap) {
            bestGap = gap;
            bestB = bT;
          }
        }
        if (!bestB || bestGap >= required) continue;
        const ratio = bestGap / required;
        const severity: 'minor' | 'major' = ratio >= minorRatio ? 'minor' : 'major';
        const [doseAt, pairedDoseAt] =
          aT.getTime() < bestB.getTime() ? [aT, bestB] : [bestB, aT];
        const medsSorted = [A.medicationId, B.medicationId].sort();
        const medA = medsSorted[0]!;
        const medB = medsSorted[1]!;
        conflicts.push({
          medicationIdA: medA,
          medicationIdB: medB,
          rule: strongest.rule,
          doseAt: localIso(doseAt),
          pairedDoseAt: localIso(pairedDoseAt),
          observedGapMinutes: Math.round(bestGap),
          requiredGapMinutes: required,
          severity,
          message: `${severity === 'major' ? 'Major' : 'Minor'} spacing conflict: observed ${Math.round(bestGap)} min gap, need ${required} min (${strongest.rule}).`,
        });
      }
    }
  }

  // De-duplicate (same pair, same dose, same paired dose) — when both
  // directions are scanned, a single conflict can be recorded twice.
  const seen = new Set<string>();
  const deduped: SpacingConflict[] = [];
  for (const c of conflicts) {
    const k = `${c.medicationIdA}|${c.medicationIdB}|${c.doseAt}|${c.pairedDoseAt}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }

  deduped.sort((a, b) => {
    if (a.doseAt !== b.doseAt) return a.doseAt.localeCompare(b.doseAt);
    return a.medicationIdA.localeCompare(b.medicationIdA);
  });

  return deduped;
}

/**
 * Headline string:
 *   "Timing check: 2 major and 3 minor spacing conflicts in the next 7 days."
 */
export function summarizeSpacingCheck(conflicts: SpacingConflict[]): string {
  if (conflicts.length === 0) return 'Timing check: no spacing conflicts detected.';
  const major = conflicts.filter((c) => c.severity === 'major').length;
  const minor = conflicts.filter((c) => c.severity === 'minor').length;
  const parts: string[] = [];
  if (major) parts.push(`${major} major`);
  if (minor) parts.push(`${minor} minor`);
  return `Timing check: ${parts.join(' and ')} spacing conflict${conflicts.length === 1 ? '' : 's'} detected.`;
}
