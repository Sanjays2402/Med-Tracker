import { addDays, startOfDay } from './date';

/**
 * Industry standard adherence metrics for medication use.
 *
 * MPR (Medication Possession Ratio): sum of days supplied during the window
 * divided by the window length. Can exceed 1.0 when refills overlap; commonly
 * capped at 1.0 for reporting.
 *
 * PDC (Proportion of Days Covered): the fraction of days in the window on
 * which the patient had medication available, never exceeding 1.0. PDC is the
 * CMS-preferred measure because overlapping refills do not double count.
 *
 * Inputs are intentionally minimal: a list of refill events with a fill date
 * and a day-supply, plus the window of interest. All math is done in whole
 * days using the calendar of the date objects passed in (the caller is
 * responsible for timezone alignment).
 */

export interface RefillEvent {
  medicationId: string;
  filledAt: string | Date;
  /** Number of days the fill is intended to cover. Derived from quantity / dosesPerDay. */
  daySupply: number;
}

export interface AdherenceWindow {
  start: Date;
  end: Date;
}

export interface AdherenceMetrics {
  medicationId: string;
  windowDays: number;
  daysCovered: number;
  daysSupplied: number;
  pdc: number;
  mpr: number;
  mprCapped: number;
  gaps: { start: string; end: string; days: number }[];
}

const MS_DAY = 86_400_000;

function clampDay(d: Date, lo: Date, hi: Date): Date {
  if (d.getTime() < lo.getTime()) return lo;
  if (d.getTime() > hi.getTime()) return hi;
  return d;
}

/**
 * Compute MPR and PDC for one medication's refill history within a window.
 * `refills` may be in any order; events outside the window contribute only
 * the portion of their day-supply that overlaps.
 */
export function adherenceForMedication(
  medicationId: string,
  refills: RefillEvent[],
  window: AdherenceWindow,
): AdherenceMetrics {
  const winStart = startOfDay(window.start);
  const winEnd = startOfDay(window.end);
  if (winEnd.getTime() <= winStart.getTime()) {
    return {
      medicationId,
      windowDays: 0,
      daysCovered: 0,
      daysSupplied: 0,
      pdc: 0,
      mpr: 0,
      mprCapped: 0,
      gaps: [],
    };
  }
  const windowDays = Math.round((winEnd.getTime() - winStart.getTime()) / MS_DAY) + 1;

  // Sort by fill date
  const sorted = refills
    .filter((r) => r.medicationId === medicationId && r.daySupply > 0)
    .map((r) => ({ ...r, filledAt: new Date(r.filledAt) }))
    .sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());

  // Build per-day coverage bitmap for PDC and count overlapping supply for MPR
  const covered = new Uint8Array(windowDays);
  let daysSupplied = 0;

  for (const r of sorted) {
    const fillStart = startOfDay(r.filledAt);
    const fillEnd = addDays(fillStart, r.daySupply - 1);
    // Contribution to daysSupplied is the overlap with the window (MPR numerator).
    const clippedStart = clampDay(fillStart, winStart, winEnd);
    const clippedEnd = clampDay(fillEnd, winStart, winEnd);
    if (fillEnd.getTime() < winStart.getTime() || fillStart.getTime() > winEnd.getTime()) continue;
    const overlap = Math.round((clippedEnd.getTime() - clippedStart.getTime()) / MS_DAY) + 1;
    daysSupplied += overlap;
    // Mark covered days for PDC
    const startIdx = Math.round((clippedStart.getTime() - winStart.getTime()) / MS_DAY);
    const endIdx = Math.round((clippedEnd.getTime() - winStart.getTime()) / MS_DAY);
    for (let i = startIdx; i <= endIdx; i++) covered[i] = 1;
  }

  let daysCovered = 0;
  for (let i = 0; i < windowDays; i++) if (covered[i]) daysCovered += 1;

  // Detect gap runs of uncovered days for reporting
  const gaps: { start: string; end: string; days: number }[] = [];
  let runStart = -1;
  for (let i = 0; i < windowDays; i++) {
    if (!covered[i]) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      gaps.push({
        start: addDays(winStart, runStart).toISOString().slice(0, 10),
        end: addDays(winStart, i - 1).toISOString().slice(0, 10),
        days: i - runStart,
      });
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    gaps.push({
      start: addDays(winStart, runStart).toISOString().slice(0, 10),
      end: addDays(winStart, windowDays - 1).toISOString().slice(0, 10),
      days: windowDays - runStart,
    });
  }

  const pdc = round3(daysCovered / windowDays);
  const mpr = round3(daysSupplied / windowDays);
  const mprCapped = Math.min(1, mpr);

  return {
    medicationId,
    windowDays,
    daysCovered,
    daysSupplied,
    pdc,
    mpr,
    mprCapped: round3(mprCapped),
    gaps,
  };
}

/**
 * Compute metrics for many medications and return both per-medication and
 * weighted summary statistics. The summary weights each medication equally;
 * pass `weights` to override (e.g. by chronic-disease class).
 */
export interface AdherenceSummary {
  perMedication: AdherenceMetrics[];
  averagePdc: number;
  averageMpr: number;
  adherentCount: number;
  nonAdherentCount: number;
  /** PDC threshold used for the adherent classification. Default 0.80 per CMS. */
  threshold: number;
}

export function adherenceSummary(
  medicationIds: string[],
  refills: RefillEvent[],
  window: AdherenceWindow,
  options: { threshold?: number } = {},
): AdherenceSummary {
  const threshold = options.threshold ?? 0.8;
  const perMedication = medicationIds.map((id) => adherenceForMedication(id, refills, window));
  if (!perMedication.length) {
    return { perMedication: [], averagePdc: 0, averageMpr: 0, adherentCount: 0, nonAdherentCount: 0, threshold };
  }
  const sumPdc = perMedication.reduce((a, m) => a + m.pdc, 0);
  const sumMpr = perMedication.reduce((a, m) => a + m.mprCapped, 0);
  const adherent = perMedication.filter((m) => m.pdc >= threshold).length;
  return {
    perMedication,
    averagePdc: round3(sumPdc / perMedication.length),
    averageMpr: round3(sumMpr / perMedication.length),
    adherentCount: adherent,
    nonAdherentCount: perMedication.length - adherent,
    threshold,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
