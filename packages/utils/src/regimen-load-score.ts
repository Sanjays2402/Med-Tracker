/**
 * Regimen load score.
 *
 * A regimen with 4 medications is not 1/3rd the burden of one with
 * 12 — it depends on dosing frequency, lab monitoring cadence, pill
 * count, dollar cost, and whether any of those meds are PRN. Clinicians
 * call this "treatment burden"; the literature has half a dozen
 * scoring instruments (TBQ, MTBQ, etc) but none of them are pure
 * functions of the regimen — they all require patient-reported
 * inputs.
 *
 * This module produces an OBJECTIVE composite load score on a 0..100
 * scale derived entirely from data Med-Tracker already has:
 *
 *   - dosing component: scheduled administrations per day, plus a
 *     small penalty for high doses-per-day-per-medication (every
 *     reminder is a context switch),
 *   - pill component: total tablets/capsules + liquid/injection
 *     counts (from pill-burden),
 *   - monitoring component: # of lab requirements and how many of
 *     them are overdue (from lab-window-tracker output),
 *   - cost component: annualised regimen cost in cents (from
 *     refill-cost-projector output) bucketed against an affordability
 *     baseline,
 *   - PRN component: distinct PRN medications add a small load each
 *     (decision burden of "should I take this?").
 *
 * The score is for INTERNAL DASHBOARD USE: lower is lighter. It is
 * not a clinical recommendation. A high score is a hint that a
 * de-prescribing review or medication-burden conversation might be
 * worthwhile.
 *
 * Pure / deterministic. Composes pill-burden, lab-window-tracker, and
 * refill-cost-projector outputs.
 */

import type { PillBurdenSummary } from './pill-burden';
import type { LabWindowReport, LabStatus } from './lab-window-tracker';
import type { RegimenCostProjection } from './refill-cost-projector';

export interface RegimenLoadInput {
  /** Summary from summarizePillBurden(...). */
  pillBurden: PillBurdenSummary;
  /** Report from buildLabWindowReport(...). Optional — no labs means no monitoring load. */
  labReport?: LabWindowReport;
  /** Annual cost projection from projectRegimenCost(...). Optional. */
  costProjection?: RegimenCostProjection;
  /**
   * Distinct active PRN medications. We use a count rather than a
   * detailed list because the load is purely the decision burden of
   * "do I need this?" — every PRN adds the same fixed weight.
   */
  prnMedicationCount?: number;
}

export interface RegimenLoadOptions {
  /**
   * Annual regimen-cost-per-year at which the cost component scores 100/100
   * within its component (linear up to that ceiling, capped at 1.0 above).
   * Default: 600000 cents = $6000/year (US median per-capita Rx spend baseline).
   */
  costCeilingCents?: number;
  /**
   * Number of distinct medications at which the medication-count
   * sub-component scores 1.0. Default 12 (textbook polypharmacy cutoff).
   */
  medCountCeiling?: number;
  /**
   * Number of scheduled administrations per day at which the dosing
   * sub-component scores 1.0. Default 18.
   */
  adminsPerDayCeiling?: number;
  /**
   * Number of lab requirements at which the monitoring sub-component
   * scores 1.0 BEFORE the overdue penalty. Default 8.
   */
  labCountCeiling?: number;
  /**
   * Number of pieces (pills + injections, ignoring liquid mL) per day
   * at which the pill sub-component scores 1.0. Default 20.
   */
  piecesPerDayCeiling?: number;
  /**
   * Number of distinct PRN medications at which the PRN sub-component
   * scores 1.0. Default 5.
   */
  prnCountCeiling?: number;
  /**
   * Weighting of the five components in the composite. Defaults sum
   * to 1.0 but the function normalises any positive set.
   * Dosing 0.30, pills 0.25, monitoring 0.20, cost 0.15, prn 0.10.
   */
  weights?: Partial<{
    dosing: number;
    pills: number;
    monitoring: number;
    cost: number;
    prn: number;
  }>;
}

export type RegimenLoadBand = 'light' | 'moderate' | 'heavy' | 'severe';

export interface RegimenLoadComponent {
  /** 0..100 contribution within the component (before weighting). */
  score: number;
  /** Numeric input that drove the score. */
  inputs: Record<string, number>;
  /** Short label the dashboard tooltip can render. */
  reason: string;
}

export interface RegimenLoadScore {
  /** 0..100 composite. Lower is lighter. */
  total: number;
  band: RegimenLoadBand;
  /** Per-component breakdown so the UI can show "dosing 18, pills 22, ..." */
  components: {
    dosing: RegimenLoadComponent;
    pills: RegimenLoadComponent;
    monitoring: RegimenLoadComponent;
    cost: RegimenLoadComponent;
    prn: RegimenLoadComponent;
  };
  /** Weighted contribution of each component to the total (sum ~= total). */
  weightedContributions: {
    dosing: number;
    pills: number;
    monitoring: number;
    cost: number;
    prn: number;
  };
  /** Human-readable line: "Heavy regimen (62/100) driven by pill count + dosing frequency". */
  summary: string;
}

interface Weights {
  dosing: number;
  pills: number;
  monitoring: number;
  cost: number;
  prn: number;
}

const DEFAULT_WEIGHTS: Weights = {
  dosing: 0.3,
  pills: 0.25,
  monitoring: 0.2,
  cost: 0.15,
  prn: 0.1,
};

const LAB_OVERDUE_PENALTY: Record<LabStatus, number> = {
  overdue: 0.5,
  'due-soon': 0.15,
  'no-history': 0.25,
  'on-track': 0,
  'not-due-yet': 0,
};

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function bandFor(total: number): RegimenLoadBand {
  if (total < 25) return 'light';
  if (total < 50) return 'moderate';
  if (total < 75) return 'heavy';
  return 'severe';
}

function bandLabel(band: RegimenLoadBand): string {
  switch (band) {
    case 'light': return 'Light';
    case 'moderate': return 'Moderate';
    case 'heavy': return 'Heavy';
    case 'severe': return 'Severe';
  }
}

function normalizeWeights(
  weights: RegimenLoadOptions['weights'],
): Weights {
  const merged = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const sum = merged.dosing + merged.pills + merged.monitoring + merged.cost + merged.prn;
  if (!Number.isFinite(sum) || sum <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    dosing: merged.dosing / sum,
    pills: merged.pills / sum,
    monitoring: merged.monitoring / sum,
    cost: merged.cost / sum,
    prn: merged.prn / sum,
  };
}

function dosingScore(
  pill: PillBurdenSummary,
  adminsCeiling: number,
  medCeiling: number,
): RegimenLoadComponent {
  const admins = pill.administrationsPerDay;
  const meds = pill.medicationCount;
  // Equal blend of "how often per day" and "how many distinct meds".
  const adminPart = clampUnit(admins / adminsCeiling);
  const medPart = clampUnit(meds / medCeiling);
  const score = clampUnit((adminPart + medPart) / 2) * 100;
  return {
    score,
    inputs: { administrationsPerDay: admins, medicationCount: meds },
    reason: `${meds} meds across ${admins.toFixed(1)} doses/day`,
  };
}

function pillsScore(
  pill: PillBurdenSummary,
  ceiling: number,
): RegimenLoadComponent {
  const pieces = pill.pillCount + pill.injectionCount;
  const fraction = clampUnit(pieces / ceiling);
  const score = fraction * 100;
  return {
    score,
    inputs: {
      pillCount: pill.pillCount,
      injectionCount: pill.injectionCount,
      liquidMl: pill.liquidMl,
    },
    reason: `${pill.pillCount} pills + ${pill.injectionCount} injections/day`,
  };
}

function monitoringScore(
  report: LabWindowReport | undefined,
  labCeiling: number,
): RegimenLoadComponent {
  if (!report || report.flat.length === 0) {
    return { score: 0, inputs: { labRequirements: 0, overdueCount: 0 }, reason: 'No lab monitoring required' };
  }
  const labCount = report.flat.length;
  const baseline = clampUnit(labCount / labCeiling);
  // Overdue boost: weighted sum of per-status penalties divided by labCount, clamped.
  let weightedPenalty = 0;
  for (const w of report.flat) {
    weightedPenalty += LAB_OVERDUE_PENALTY[w.status];
  }
  const overduePenalty = clampUnit(weightedPenalty / labCount);
  // 70% baseline cadence load + 30% overdue burden.
  const combined = clampUnit(0.7 * baseline + 0.3 * overduePenalty);
  const score = combined * 100;
  const overdue = report.totals.overdue ?? 0;
  return {
    score,
    inputs: {
      labRequirements: labCount,
      overdueCount: overdue,
    },
    reason: overdue > 0
      ? `${labCount} labs (${overdue} overdue)`
      : `${labCount} labs to track`,
  };
}

function costScore(
  cost: RegimenCostProjection | undefined,
  ceilingCents: number,
): RegimenLoadComponent {
  if (!cost) {
    return { score: 0, inputs: { annualCents: 0 }, reason: 'Cost data unavailable' };
  }
  const annual = cost.totalCents;
  const fraction = clampUnit(annual / ceilingCents);
  return {
    score: fraction * 100,
    inputs: { annualCents: annual, ceilingCents },
    reason: `$${(annual / 100).toFixed(0)}/year projected spend`,
  };
}

function prnScore(prnCount: number, ceiling: number): RegimenLoadComponent {
  const fraction = clampUnit(prnCount / ceiling);
  return {
    score: fraction * 100,
    inputs: { prnMedicationCount: prnCount },
    reason: prnCount === 0 ? 'No PRN medications' : `${prnCount} PRN medication${prnCount === 1 ? '' : 's'}`,
  };
}

/**
 * Compute the regimen load score.
 *
 * Each component scores 0..100. Composite total weights components per
 * `options.weights` (defaults to dosing 0.30 / pills 0.25 / monitoring
 * 0.20 / cost 0.15 / prn 0.10). Band: light <25, moderate <50, heavy
 * <75, else severe. Negative or non-finite inputs are treated as zero.
 */
export function scoreRegimenLoad(
  input: RegimenLoadInput,
  options: RegimenLoadOptions = {},
): RegimenLoadScore {
  const costCeiling = options.costCeilingCents ?? 600_000;
  const medCeiling = options.medCountCeiling ?? 12;
  const adminCeiling = options.adminsPerDayCeiling ?? 18;
  const labCeiling = options.labCountCeiling ?? 8;
  const piecesCeiling = options.piecesPerDayCeiling ?? 20;
  const prnCeiling = options.prnCountCeiling ?? 5;
  const weights = normalizeWeights(options.weights);

  const dosing = dosingScore(input.pillBurden, adminCeiling, medCeiling);
  const pills = pillsScore(input.pillBurden, piecesCeiling);
  const monitoring = monitoringScore(input.labReport, labCeiling);
  const cost = costScore(input.costProjection, costCeiling);
  const prn = prnScore(input.prnMedicationCount ?? 0, prnCeiling);

  const weightedContributions = {
    dosing: dosing.score * weights.dosing,
    pills: pills.score * weights.pills,
    monitoring: monitoring.score * weights.monitoring,
    cost: cost.score * weights.cost,
    prn: prn.score * weights.prn,
  };
  const total = clampUnit(
    (weightedContributions.dosing +
      weightedContributions.pills +
      weightedContributions.monitoring +
      weightedContributions.cost +
      weightedContributions.prn) /
      100,
  ) * 100;
  const band = bandFor(total);

  // Build summary: pick top 2 weighted contributions as drivers.
  const drivers = (Object.entries(weightedContributions) as Array<[keyof typeof weightedContributions, number]>)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => k);
  const summary = drivers.length > 0
    ? `${bandLabel(band)} regimen (${Math.round(total)}/100), driven by ${drivers.join(' + ')}`
    : `${bandLabel(band)} regimen (${Math.round(total)}/100)`;

  return {
    total,
    band,
    components: { dosing, pills, monitoring, cost, prn },
    weightedContributions,
    summary,
  };
}
