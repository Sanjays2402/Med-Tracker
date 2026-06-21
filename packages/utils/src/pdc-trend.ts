/**
 * Rolling PDC trend.
 *
 * pdc-by-medication.ts gives a single Proportion-of-Days-Covered
 * number for a measurement window. That's the right thing to report
 * to a PBM or to a CMS Star audit — but for the patient and the
 * caregiver dashboard the more actionable question is: "is adherence
 * trending UP or DOWN?". A medication can sit at 0.82 today and look
 * fine, but if it was 0.95 ninety days ago that's the same signal as
 * a urgent refill: the patient is drifting.
 *
 * This module computes PDC over a stack of rolling windows (typically
 * 90 / 180 / 365 days), each anchored at the same `asOf` date but
 * with a different start. For each medication it then computes a
 * slope across those windows so the UI can render a sparkline AND
 * label the direction (improving / stable / declining). The math is
 * deliberately simple: PDC is already a noisy estimate at small
 * windows so a 4-point linear fit is honest about its uncertainty.
 *
 * Pure / deterministic. No I/O. Composes directly on
 * computePdc(fills, { measurementStart, measurementEnd }).
 */

import { addDays, startOfDay } from './date';
import { computePdc, type MedicationPdc } from './pdc-by-medication';
import type { PharmacyFillEvent } from './prescription-fill-history';

export interface PdcTrendOptions {
  /**
   * Reference date for every window. The window of length `windowDays`
   * is [asOf - windowDays + 1, asOf] inclusive. Default: today (local).
   */
  asOf?: Date;
  /**
   * Window lengths in days. Default [90, 180, 365] — the CMS Star
   * "rolling-12" set plus two shorter windows for trend.
   */
  windowsDays?: number[];
  /** PDC threshold for the per-window adherent flag. Default 0.80. */
  adherentThreshold?: number;
  /**
   * Minimum absolute PDC delta across the window stack to call the
   * trend non-stable. Default 0.05 (5 percentage points). Below this
   * the medication is reported as "stable" regardless of slope sign.
   */
  stableBandDelta?: number;
}

export type PdcTrendDirection =
  | 'improving'
  | 'declining'
  | 'stable'
  | 'insufficient';

export interface WindowPdc {
  windowDays: number;
  measurementStart: string;
  measurementEnd: string;
  pdc: number;
  adherent: boolean;
  /** True when no fill landed inside this window (denominator empty). */
  noFill: boolean;
}

export interface MedicationPdcTrend {
  medicationId: string;
  /** PDC at each window, ordered by windowDays ascending. */
  windows: WindowPdc[];
  /** Latest = shortest window PDC (the "now" number). */
  latestPdc: number | null;
  /** Earliest = longest window PDC (the historical baseline). */
  baselinePdc: number | null;
  /** latestPdc - baselinePdc. Positive when adherence improved recently. */
  delta: number | null;
  /**
   * Slope of latestPdc vs windowDays (negative slope = shorter window
   * has higher PDC = improving recent adherence). Reported in PDC
   * units per day. Null when fewer than 2 windows have a fill.
   */
  slopePerDay: number | null;
  direction: PdcTrendDirection;
  /**
   * Plain-English message suitable for surfacing in a dashboard chip.
   * Examples:
   *   "Improving (0.78 -> 0.92 over 365d)."
   *   "Stable around 0.84."
   *   "Declining (0.95 -> 0.81 over 365d)."
   */
  message: string;
}

export interface PdcTrendReport {
  asOf: string;
  windowsDays: number[];
  perMedication: MedicationPdcTrend[];
  /** Medications whose direction is 'declining'. */
  declining: MedicationPdcTrend[];
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute slope of (windowDays_i, pdc_i) pairs using ordinary least
 * squares. Returns null when fewer than 2 distinct windowDays have a
 * non-null PDC.
 */
function linearSlope(points: { x: number; y: number }[]): number | null {
  const xs = new Set(points.map((p) => p.x));
  if (points.length < 2 || xs.size < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

function describe(
  latest: number | null,
  baseline: number | null,
  longestWindow: number,
  direction: PdcTrendDirection,
): string {
  if (direction === 'insufficient') {
    return 'Not enough fill history to compute a trend.';
  }
  if (latest === null || baseline === null) {
    return 'Not enough fill history to compute a trend.';
  }
  const lp = Math.round(latest * 100);
  const bp = Math.round(baseline * 100);
  if (direction === 'stable') return `Stable around ${lp}%.`;
  const arrow = direction === 'improving' ? 'Improving' : 'Declining';
  return `${arrow} (${bp}% -> ${lp}% over ${longestWindow}d).`;
}

/**
 * Compute rolling-window PDC trends for every medication present in
 * the fill list. Windows default to [90, 180, 365] days, all anchored
 * at `asOf`. For each window, computePdc runs with an explicit
 * (measurementStart, measurementEnd) so gaps are scoped to the
 * window — without explicit bounds, PDC would use per-medication
 * natural spans and the trend stack would compare apples and oranges.
 *
 * The "latest" PDC is the SHORTEST window (e.g. 90d) — that's what
 * the dashboard surfaces as "now". The "baseline" is the LONGEST
 * window (e.g. 365d) — that's the historical comparator. A medication
 * whose latest > baseline is improving; whose latest < baseline is
 * declining. The `stableBandDelta` option suppresses small wiggles.
 */
export function computePdcTrend(
  fills: PharmacyFillEvent[],
  options: PdcTrendOptions = {},
): PdcTrendReport {
  const asOf = startOfDay(options.asOf ?? new Date());
  const windowsDays = (options.windowsDays ?? [90, 180, 365])
    .filter((d) => Number.isFinite(d) && d > 0)
    .map((d) => Math.floor(d))
    .sort((a, b) => a - b);
  if (windowsDays.length === 0) {
    return {
      asOf: toIso(asOf),
      windowsDays: [],
      perMedication: [],
      declining: [],
    };
  }
  const threshold = options.adherentThreshold ?? 0.8;
  const stableBand = Math.max(0, options.stableBandDelta ?? 0.05);

  // Collect every medicationId that has at least one fill on or
  // before asOf — those are the medications we will report on.
  const medIds = new Set<string>();
  const asOfMs = asOf.getTime();
  for (const f of fills) {
    const d = f.fillDate instanceof Date ? f.fillDate : new Date(f.fillDate);
    if (Number.isNaN(d.getTime())) continue;
    if (startOfDay(d).getTime() <= asOfMs) medIds.add(f.medicationId);
  }

  // Run computePdc once per window — this is O(windows * fills) but
  // windows is tiny (default 3) and the inner pass is already linear.
  const reportsByWindow = new Map<number, MedicationPdc[]>();
  for (const w of windowsDays) {
    const start = addDays(asOf, -(w - 1));
    const report = computePdc(fills, {
      measurementStart: start,
      measurementEnd: asOf,
      adherentThreshold: threshold,
    });
    reportsByWindow.set(w, report.perMedication);
  }

  const perMedication: MedicationPdcTrend[] = [];
  for (const medicationId of medIds) {
    const windowPdcs: WindowPdc[] = [];
    for (const w of windowsDays) {
      const list = reportsByWindow.get(w) ?? [];
      const entry = list.find((m) => m.medicationId === medicationId);
      const start = addDays(asOf, -(w - 1));
      if (entry) {
        windowPdcs.push({
          windowDays: w,
          measurementStart: toIso(start),
          measurementEnd: toIso(asOf),
          pdc: entry.pdc,
          adherent: entry.adherent,
          noFill: false,
        });
      } else {
        windowPdcs.push({
          windowDays: w,
          measurementStart: toIso(start),
          measurementEnd: toIso(asOf),
          pdc: 0,
          adherent: false,
          noFill: true,
        });
      }
    }

    const realPoints = windowPdcs.filter((w) => !w.noFill);
    let latestPdc: number | null = null;
    let baselinePdc: number | null = null;
    let delta: number | null = null;
    let slopePerDay: number | null = null;
    let direction: PdcTrendDirection;

    if (realPoints.length === 0) {
      direction = 'insufficient';
    } else {
      // Smallest window = "latest", largest = "baseline".
      // We pick from the full windowPdcs array (in ascending order)
      // so the headline numbers correspond to the configured stack.
      latestPdc = windowPdcs[0]!.pdc;
      baselinePdc = windowPdcs[windowPdcs.length - 1]!.pdc;
      delta = latestPdc - baselinePdc;
      slopePerDay = linearSlope(
        realPoints.map((w) => ({ x: w.windowDays, y: w.pdc })),
      );
      if (realPoints.length < 2) {
        direction = 'insufficient';
      } else if (Math.abs(delta) < stableBand) {
        direction = 'stable';
      } else if (delta > 0) {
        direction = 'improving';
      } else {
        direction = 'declining';
      }
    }

    perMedication.push({
      medicationId,
      windows: windowPdcs,
      latestPdc,
      baselinePdc,
      delta: delta === null ? null : round2(delta),
      slopePerDay: slopePerDay === null ? null : slopePerDay,
      direction,
      message: describe(
        latestPdc,
        baselinePdc,
        windowsDays[windowsDays.length - 1]!,
        direction,
      ),
    });
  }

  perMedication.sort((a, b) => a.medicationId.localeCompare(b.medicationId));
  const declining = perMedication.filter((m) => m.direction === 'declining');

  return {
    asOf: toIso(asOf),
    windowsDays,
    perMedication,
    declining,
  };
}

/**
 * Headline string for the regimen-wide rollup:
 *   "Adherence trend: 1 declining, 3 stable, 1 improving across 5 medications."
 */
export function summarizePdcTrend(report: PdcTrendReport): string {
  const total = report.perMedication.length;
  if (total === 0) return 'No fill history available.';
  const improving = report.perMedication.filter((m) => m.direction === 'improving').length;
  const declining = report.perMedication.filter((m) => m.direction === 'declining').length;
  const stable = report.perMedication.filter((m) => m.direction === 'stable').length;
  const insufficient = report.perMedication.filter((m) => m.direction === 'insufficient').length;
  const parts: string[] = [];
  if (declining) parts.push(`${declining} declining`);
  if (stable) parts.push(`${stable} stable`);
  if (improving) parts.push(`${improving} improving`);
  if (insufficient) parts.push(`${insufficient} with insufficient history`);
  return `Adherence trend: ${parts.join(', ')} across ${total} medication${total === 1 ? '' : 's'}.`;
}
