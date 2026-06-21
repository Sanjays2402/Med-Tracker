/**
 * Per-medication Proportion of Days Covered (PDC).
 *
 * PDC is the FDA-style adherence metric that PBMs, Medicare Star
 * ratings, and most pharmacy quality programs ask for. Unlike
 * Medication Possession Ratio (MPR) which can exceed 1.0 when a
 * patient stockpiles, PDC caps at 1.0 and is therefore the more
 * conservative — and more honest — number for chronic regimens.
 *
 * Definition (CMS / PQA spec):
 *
 *   PDC = (# days in the measurement period during which the patient
 *          had ANY supply of the medication on hand) / (# days in the
 *          measurement period after the patient's "anchor date").
 *
 * Anchor date = date of first fill within the measurement period.
 * Days before the anchor are EXCLUDED from the denominator (you can't
 * be non-adherent to a medication you haven't been prescribed yet).
 *
 * The CMS Star measure threshold for "adherent" is PDC >= 0.80.
 *
 * This module composes directly on prescription-fill-history: it
 * accepts the same FillEvent list, derives the coverage intervals
 * using the "extend, don't reset" rule (which naturally caps PDC at
 * 1.0 since duplicate days don't accumulate), and returns per-
 * medication PDC plus a class-level rollup.
 *
 * Pure / deterministic. No I/O.
 */

import { addDays, startOfDay } from './date';
import {
  normalizeFillHistory,
  type PharmacyFillEvent,
  type MedicationCoverage,
} from './prescription-fill-history';

export interface PdcOptions {
  /** Measurement-period start (inclusive). Default: 365 days before measurementEnd. */
  measurementStart?: Date;
  /** Measurement-period end (inclusive). Default: latest fill date + daysSupply across regimen. */
  measurementEnd?: Date;
  /** PDC threshold for "adherent" (in [0, 1]). Default 0.80 per CMS Star spec. */
  adherentThreshold?: number;
  /**
   * Optional medication metadata. When supplied, the rollup grouping
   * uses `classCode` (free-text bucket — typically the DrugClassCode
   * from drug-class-coverage) so the dashboard can report "diabetes
   * PDC" by averaging metformin + sglt2 PDCs.
   */
  medicationClasses?: { medicationId: string; classCode: string }[];
}

export interface MedicationPdc {
  medicationId: string;
  /** Anchor date = first fill on or after measurementStart. ISO date. */
  anchorDate: string;
  /** Days in the denominator (anchorDate through measurementEnd, inclusive). */
  denominator: number;
  /** Days covered in the denominator window. */
  numerator: number;
  /** PDC in [0, 1]. */
  pdc: number;
  /** True iff pdc >= threshold. */
  adherent: boolean;
  /** Underlying coverage record (re-exposed for diagnostic drill-down). */
  coverage: MedicationCoverage;
}

export interface ClassPdc {
  classCode: string;
  medicationIds: string[];
  /** Unweighted mean PDC across constituent medications. */
  meanPdc: number;
  /** Count of constituent medications meeting the threshold. */
  adherentCount: number;
}

export interface PdcReport {
  measurementStart: string;
  measurementEnd: string;
  perMedication: MedicationPdc[];
  /** Empty when medicationClasses option is not supplied. */
  perClass: ClassPdc[];
  /** Unweighted mean PDC across all medications in the report. */
  meanPdc: number;
  /** Count of medications meeting the adherentThreshold. */
  adherentCount: number;
  /** Total medications in the report. */
  totalCount: number;
  /** Medications that had ZERO fills in the measurement period. */
  noFillCount: number;
}

const MS_DAY = 86_400_000;

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m as number) - 1, d as number);
}

/**
 * Compute the days-covered numerator inside [anchorMs, endMs] from the
 * medication's gap list. We use coverage gaps (instead of intervals)
 * because that's what MedicationCoverage exposes publicly.
 *
 *   numerator = totalDays - (sum of gap days inside the anchor->end window)
 */
function numeratorFromGaps(
  coverage: MedicationCoverage,
  anchorMs: number,
  endMs: number,
): number {
  if (endMs < anchorMs) return 0;
  const totalDays = Math.round((endMs - anchorMs) / MS_DAY) + 1;
  let gapDays = 0;
  for (const g of coverage.gaps) {
    const gStartMs = parseIso(g.start).getTime();
    const gEndMs = parseIso(g.end).getTime();
    const s = Math.max(gStartMs, anchorMs);
    const e = Math.min(gEndMs, endMs);
    if (s <= e) gapDays += Math.round((e - s) / MS_DAY) + 1;
  }
  return Math.max(0, totalDays - gapDays);
}

/**
 * Compute per-medication PDC for the regimen.
 *
 * Returns one entry per medicationId that has at least one fill on
 * or after measurementStart. Medications whose only fills are before
 * the measurement period are EXCLUDED from perMedication AND from
 * noFillCount (they were not prescribed during the period at all).
 * Medications listed in `medicationClasses` but with zero fills inside
 * the measurement period count toward noFillCount with pdc=0.
 */
export function computePdc(
  fills: PharmacyFillEvent[],
  options: PdcOptions = {},
): PdcReport {
  const threshold = options.adherentThreshold ?? 0.8;
  const measurementEndDate =
    options.measurementEnd ?? (fills.length > 0
      ? maxFillEnd(fills)
      : new Date());
  const measurementStartDate =
    options.measurementStart ?? addDays(measurementEndDate, -364);

  const startMs = startOfDay(measurementStartDate).getTime();
  const endMs = startOfDay(measurementEndDate).getTime();

  // Run the underlying coverage pass against the explicit window so
  // gaps are reported relative to the measurement period (not the
  // per-medication natural span).
  const report = normalizeFillHistory(fills, {
    windowStart: measurementStartDate,
    windowEnd: measurementEndDate,
  });

  const perMedication: MedicationPdc[] = [];
  let totalAdherent = 0;
  let totalCount = 0;
  let noFillCount = 0;

  // Determine anchor (first fill on or after startMs) per medication.
  const fillsByMed = new Map<string, PharmacyFillEvent[]>();
  for (const f of fills) {
    const arr = fillsByMed.get(f.medicationId);
    if (arr) arr.push(f);
    else fillsByMed.set(f.medicationId, [f]);
  }

  for (const coverage of report.perMedication) {
    const medFills = fillsByMed.get(coverage.medicationId) ?? [];
    const inPeriod = medFills
      .map((f) => startOfDay(f.fillDate instanceof Date ? f.fillDate : new Date(f.fillDate)).getTime())
      .filter((ms) => !Number.isNaN(ms) && ms >= startMs && ms <= endMs)
      .sort((a, b) => a - b);
    if (inPeriod.length === 0) {
      // No fill inside the period — patient may have stockpile from a
      // prior fill (rare), but per PQA spec PDC requires an anchor
      // inside the period. Skip.
      continue;
    }
    const anchorMs = inPeriod[0]!;
    const denominator = Math.round((endMs - anchorMs) / MS_DAY) + 1;
    const numerator = numeratorFromGaps(coverage, anchorMs, endMs);
    const pdc = denominator > 0 ? Math.min(1, numerator / denominator) : 0;
    const adherent = pdc >= threshold;
    perMedication.push({
      medicationId: coverage.medicationId,
      anchorDate: toIso(new Date(anchorMs)),
      denominator,
      numerator,
      pdc,
      adherent,
      coverage,
    });
    if (adherent) totalAdherent += 1;
    totalCount += 1;
  }

  // Medications declared in classes but absent from fills (or only
  // pre-period fills) count as zero-PDC for the class rollup.
  const classOpts = options.medicationClasses ?? [];
  const reportedIds = new Set(perMedication.map((m) => m.medicationId));
  for (const c of classOpts) {
    if (!reportedIds.has(c.medicationId)) {
      // Find any fills at all (pre-period count too); if there are
      // none anywhere, this is a documentation gap not a non-adherence.
      const has = fillsByMed.has(c.medicationId);
      if (has) {
        noFillCount += 1;
        // Add a stub entry so the class rollup includes the zero.
        const emptyCoverage: MedicationCoverage = {
          medicationId: c.medicationId,
          windowStart: toIso(new Date(startMs)),
          windowEnd: toIso(new Date(endMs)),
          daysCovered: 0,
          windowDays: Math.round((endMs - startMs) / MS_DAY) + 1,
          coverageRatio: 0,
          gaps: [],
          ndcs: [],
          fillCount: 0,
        };
        perMedication.push({
          medicationId: c.medicationId,
          anchorDate: toIso(new Date(startMs)),
          denominator: Math.round((endMs - startMs) / MS_DAY) + 1,
          numerator: 0,
          pdc: 0,
          adherent: false,
          coverage: emptyCoverage,
        });
        totalCount += 1;
      }
    }
  }

  perMedication.sort((a, b) => a.medicationId.localeCompare(b.medicationId));

  // Class rollup.
  const perClass: ClassPdc[] = [];
  if (classOpts.length > 0) {
    const classByMed = new Map<string, string>();
    for (const c of classOpts) classByMed.set(c.medicationId, c.classCode);
    const classBuckets = new Map<string, MedicationPdc[]>();
    for (const m of perMedication) {
      const code = classByMed.get(m.medicationId);
      if (!code) continue;
      const arr = classBuckets.get(code);
      if (arr) arr.push(m);
      else classBuckets.set(code, [m]);
    }
    for (const [classCode, members] of classBuckets) {
      const mean = members.reduce((s, m) => s + m.pdc, 0) / members.length;
      const adherent = members.filter((m) => m.adherent).length;
      perClass.push({
        classCode,
        medicationIds: members.map((m) => m.medicationId).sort(),
        meanPdc: mean,
        adherentCount: adherent,
      });
    }
    perClass.sort((a, b) => a.classCode.localeCompare(b.classCode));
  }

  const meanPdc =
    perMedication.length > 0
      ? perMedication.reduce((s, m) => s + m.pdc, 0) / perMedication.length
      : 0;

  return {
    measurementStart: toIso(new Date(startMs)),
    measurementEnd: toIso(new Date(endMs)),
    perMedication,
    perClass,
    meanPdc,
    adherentCount: totalAdherent,
    totalCount,
    noFillCount,
  };
}

function maxFillEnd(fills: PharmacyFillEvent[]): Date {
  let best = -Infinity;
  for (const f of fills) {
    const d = f.fillDate instanceof Date ? f.fillDate : new Date(f.fillDate);
    if (Number.isNaN(d.getTime())) continue;
    const end = startOfDay(d).getTime() + ((f.daysSupply ?? 0) - 1) * MS_DAY;
    if (end > best) best = end;
  }
  return new Date(best === -Infinity ? Date.now() : best);
}

/**
 * Headline string:
 *   "Adherence (PDC): 3 of 5 medications at or above 80% (mean 76%)."
 */
export function summarizePdc(report: PdcReport): string {
  if (report.totalCount === 0) return 'No fills in the measurement period.';
  const meanPct = Math.round(report.meanPdc * 100);
  return `Adherence (PDC): ${report.adherentCount} of ${report.totalCount} medication${report.totalCount === 1 ? '' : 's'} at or above 80% (mean ${meanPct}%).`;
}

/**
 * Bucket label per CMS Star colour banding:
 *   - excellent: >= 0.90
 *   - good:      0.80 - 0.89
 *   - watch:     0.50 - 0.79
 *   - critical:  < 0.50
 */
export type PdcBand = 'excellent' | 'good' | 'watch' | 'critical';

export function pdcBand(pdc: number): PdcBand {
  if (pdc >= 0.9) return 'excellent';
  if (pdc >= 0.8) return 'good';
  if (pdc >= 0.5) return 'watch';
  return 'critical';
}
