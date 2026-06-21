/**
 * Medication refusal trend.
 *
 * `medication-refusal-log` gives a single-window rollup of refusals
 * per medication: "in the last 30 days the patient refused atorvastatin
 * 4 times, 3 of them citing nausea." That's the right number to drive
 * the de-prescribing-candidate flag — but it CANNOT answer the more
 * important question: "is this getting WORSE?"
 *
 * A medication that has 3 nausea refusals in the last 30 days but had
 * 0 in the prior 60 days is a different clinical situation from one
 * that has 3 nausea refusals every month for a year. The first is a
 * NEW tolerability problem (recent change in another medication?
 * Disease progression? Dose change?). The second is steady-state
 * intolerance that the patient has already adapted to.
 *
 * This module computes refusal density across rolling 30/90/180-day
 * windows so the dashboard can render the same sparkline pattern as
 * pdc-trend / regimen-load-trend: a per-medication trajectory with
 * direction (rising / stable / falling) and a tolerability sub-trend
 * so the UI can flag "tolerability refusals are climbing" BEFORE the
 * de-prescribing-candidate threshold trips.
 *
 * Pure / deterministic. No I/O. Composes directly on
 * NormalizedRefusal[] from medication-refusal-log.
 */

import { startOfDay } from './date';
import type {
  NormalizedRefusal,
  RefusalReasonCode,
} from './medication-refusal-log';

export interface RefusalTrendOptions {
  /**
   * Reference date for every window. The window of length `windowDays`
   * is [asOf - windowDays + 1, asOf] inclusive. Default: today (local).
   */
  asOf?: Date;
  /**
   * Window lengths in days. Default [30, 90, 180] — short window for
   * "now", medium for trend baseline, long for steady-state comparator.
   */
  windowsDays?: number[];
  /**
   * Minimum absolute density delta (refusals/day) across the window
   * stack to call the trend non-stable. Default 0.01 (~ 3 extra
   * refusals per month). Below this the medication is reported as
   * "stable" regardless of slope sign.
   */
  stableBandDelta?: number;
  /**
   * Minimum recent (shortest-window) refusal count before we report
   * a direction at all. Below this the trend is 'insufficient' — two
   * refusals do not constitute a trend, no matter when they happened.
   * Default 2.
   */
  minRecentRefusals?: number;
  /**
   * Lead threshold: minimum tolerability share AND minimum recent
   * tolerability count to surface a `risingTolerability` flag BEFORE
   * the de-prescribing candidate threshold (which is recent >= 3 AND
   * share >= 0.5 in medication-refusal-log). The lead defaults pick
   * up patients at 2 tolerability refusals with share >= 0.4.
   */
  leadTolerabilityShare?: number;
  leadTolerabilityCount?: number;
}

export type RefusalTrendDirection =
  | 'rising'
  | 'falling'
  | 'stable'
  | 'insufficient';

export interface RefusalWindowDensity {
  windowDays: number;
  measurementStart: string;
  measurementEnd: string;
  /** Total refusals in the window. */
  count: number;
  /** Refusals per day. count / windowDays. */
  densityPerDay: number;
  /** Tolerability refusals in the window (nausea + side-effect). */
  tolerabilityCount: number;
  /** Tolerability density per day. */
  tolerabilityDensityPerDay: number;
  /** True when zero refusals were logged in this window. */
  empty: boolean;
}

export interface MedicationRefusalTrend {
  medicationId: string;
  medicationName?: string;
  windows: RefusalWindowDensity[];
  /** Latest = shortest window density. */
  latestDensity: number | null;
  /** Baseline = longest window density. */
  baselineDensity: number | null;
  /** latestDensity - baselineDensity. Positive when refusals rising. */
  delta: number | null;
  /** Same for tolerability sub-stream. */
  latestTolerabilityDensity: number | null;
  baselineTolerabilityDensity: number | null;
  tolerabilityDelta: number | null;
  direction: RefusalTrendDirection;
  tolerabilityDirection: RefusalTrendDirection;
  /**
   * True when latest tolerability count meets the lead threshold
   * (less strict than the de-prescribing candidate flag in
   * medication-refusal-log). UI uses this to soft-alert before the
   * harder candidate flag trips.
   */
  risingTolerability: boolean;
  /**
   * Plain-English headline for the dashboard chip:
   *   "Rising (0.03 -> 0.13 refusals/day over 180d)."
   *   "Stable around 0.05 refusals/day."
   *   "Tolerability climbing: 4 recent refusals (3 nausea, 1 side-effect)."
   */
  message: string;
}

export interface RefusalTrendReport {
  asOf: string;
  windowsDays: number[];
  perMedication: MedicationRefusalTrend[];
  /** Medications whose overall direction is 'rising'. */
  rising: MedicationRefusalTrend[];
  /** Medications whose tolerability lead flag tripped (subset of rising). */
  risingTolerability: MedicationRefusalTrend[];
}

const TOLERABILITY_REASONS: ReadonlySet<RefusalReasonCode> = new Set([
  'nausea',
  'side-effect',
]);

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function describe(
  latest: number | null,
  baseline: number | null,
  longestWindow: number,
  direction: RefusalTrendDirection,
): string {
  if (direction === 'insufficient' || latest === null || baseline === null) {
    return 'Not enough refusal history to compute a trend.';
  }
  const fmt = (n: number) => n.toFixed(2);
  if (direction === 'stable') return `Stable around ${fmt(latest)} refusals/day.`;
  const arrow = direction === 'rising' ? 'Rising' : 'Falling';
  return `${arrow} (${fmt(baseline)} -> ${fmt(latest)} refusals/day over ${longestWindow}d).`;
}

function describeTolerability(
  recent: number,
  byReason: Partial<Record<RefusalReasonCode, number>>,
): string {
  const parts: string[] = [];
  for (const reason of ['nausea', 'side-effect'] as const) {
    const n = byReason[reason] ?? 0;
    if (n > 0) parts.push(`${n} ${reason}`);
  }
  const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Tolerability climbing: ${recent} recent refusal${recent === 1 ? '' : 's'}${detail}.`;
}

function classify(
  latest: number | null,
  baseline: number | null,
  realPoints: number,
  recentCount: number,
  minRecent: number,
  stableBand: number,
): RefusalTrendDirection {
  if (latest === null || baseline === null) return 'insufficient';
  if (recentCount < minRecent) return 'insufficient';
  if (realPoints < 2) return 'insufficient';
  const delta = latest - baseline;
  if (Math.abs(delta) < stableBand) return 'stable';
  return delta > 0 ? 'rising' : 'falling';
}

/**
 * Compute rolling-window refusal trends for every medication present
 * in the refusal list. Windows default to [30, 90, 180] days, all
 * anchored at `asOf`. The "latest" density is the SHORTEST window;
 * "baseline" is the LONGEST window. Positive delta = recent density
 * rises above baseline = rising trend (bad: refusals are climbing).
 *
 * Tolerability sub-stream is computed independently — the dashboard
 * can show both "overall refusals stable but tolerability rising" so
 * the prescriber sees side-effect signals BEFORE total refusals tip
 * past the de-prescribing threshold.
 */
export function computeRefusalTrend(
  refusals: NormalizedRefusal[],
  options: RefusalTrendOptions = {},
): RefusalTrendReport {
  const asOf = startOfDay(options.asOf ?? new Date());
  const windowsDays = (options.windowsDays ?? [30, 90, 180])
    .filter((d) => Number.isFinite(d) && d > 0)
    .map((d) => Math.floor(d))
    .sort((a, b) => a - b);
  if (windowsDays.length === 0) {
    return {
      asOf: toIso(asOf),
      windowsDays: [],
      perMedication: [],
      rising: [],
      risingTolerability: [],
    };
  }
  const stableBand = Math.max(0, options.stableBandDelta ?? 0.01);
  const minRecent = Math.max(1, options.minRecentRefusals ?? 2);
  const leadShare = Math.max(0, options.leadTolerabilityShare ?? 0.4);
  const leadCount = Math.max(1, options.leadTolerabilityCount ?? 2);

  const asOfMs = asOf.getTime();
  // Bucket refusals by medicationId; capture latest medicationName.
  type Bucket = {
    medicationId: string;
    medicationName?: string;
    entries: { ms: number; reason: RefusalReasonCode }[];
  };
  const buckets = new Map<string, Bucket>();
  for (const r of refusals) {
    const loggedMs = Date.parse(r.loggedAt);
    if (!Number.isFinite(loggedMs)) continue;
    if (startOfDay(new Date(loggedMs)).getTime() > asOfMs) continue;
    let b = buckets.get(r.medicationId);
    if (!b) {
      b = { medicationId: r.medicationId, entries: [] };
      buckets.set(r.medicationId, b);
    }
    if (r.medicationName && !b.medicationName) b.medicationName = r.medicationName;
    b.entries.push({ ms: loggedMs, reason: r.reason });
  }

  const perMedication: MedicationRefusalTrend[] = [];
  for (const bucket of buckets.values()) {
    const windowDensities: RefusalWindowDensity[] = [];
    const dayMs = 86_400_000;
    // Track reason counts for the SHORTEST window only — that's the
    // tolerability detail we surface in the headline.
    let recentTolerabilityByReason: Partial<Record<RefusalReasonCode, number>> = {};
    let recentTotalCount = 0;
    for (let i = 0; i < windowsDays.length; i++) {
      const w = windowsDays[i]!;
      const start = startOfDay(new Date(asOfMs - (w - 1) * dayMs));
      const startMs = start.getTime();
      let count = 0;
      let tol = 0;
      const byReason: Partial<Record<RefusalReasonCode, number>> = {};
      for (const e of bucket.entries) {
        if (e.ms < startMs) continue;
        count += 1;
        byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
        if (TOLERABILITY_REASONS.has(e.reason)) tol += 1;
      }
      windowDensities.push({
        windowDays: w,
        measurementStart: toIso(start),
        measurementEnd: toIso(asOf),
        count,
        densityPerDay: round4(count / w),
        tolerabilityCount: tol,
        tolerabilityDensityPerDay: round4(tol / w),
        empty: count === 0,
      });
      if (i === 0) {
        recentTolerabilityByReason = byReason;
        recentTotalCount = count;
      }
    }

    const realPoints = windowDensities.filter((w) => !w.empty).length;
    const latest = windowDensities[0]!;
    const baseline = windowDensities[windowDensities.length - 1]!;
    const latestDensity = latest.empty && baseline.empty ? null : latest.densityPerDay;
    const baselineDensity = latest.empty && baseline.empty ? null : baseline.densityPerDay;
    const delta = latestDensity === null || baselineDensity === null
      ? null
      : round4(latestDensity - baselineDensity);
    const latestTol = latest.tolerabilityDensityPerDay;
    const baselineTol = baseline.tolerabilityDensityPerDay;
    const tolReal = windowDensities.filter((w) => w.tolerabilityCount > 0).length;
    const tolLatestNull = latest.tolerabilityCount === 0 && baseline.tolerabilityCount === 0;
    const latestTolerabilityDensity = tolLatestNull ? null : latestTol;
    const baselineTolerabilityDensity = tolLatestNull ? null : baselineTol;
    const tolerabilityDelta = latestTolerabilityDensity === null || baselineTolerabilityDensity === null
      ? null
      : round4(latestTolerabilityDensity - baselineTolerabilityDensity);

    const direction = classify(
      latestDensity,
      baselineDensity,
      realPoints,
      latest.count,
      minRecent,
      stableBand,
    );
    const tolerabilityDirection = classify(
      latestTolerabilityDensity,
      baselineTolerabilityDensity,
      tolReal,
      latest.tolerabilityCount,
      Math.max(1, leadCount - 1),
      stableBand,
    );

    const recentTolerabilityShare = latest.count === 0
      ? 0
      : latest.tolerabilityCount / latest.count;
    const risingTolerability =
      latest.tolerabilityCount >= leadCount &&
      recentTolerabilityShare >= leadShare;

    let message: string;
    if (risingTolerability) {
      message = describeTolerability(latest.tolerabilityCount, recentTolerabilityByReason);
    } else {
      message = describe(
        latestDensity,
        baselineDensity,
        windowsDays[windowsDays.length - 1]!,
        direction,
      );
    }

    const entry: MedicationRefusalTrend = {
      medicationId: bucket.medicationId,
      windows: windowDensities,
      latestDensity,
      baselineDensity,
      delta,
      latestTolerabilityDensity,
      baselineTolerabilityDensity,
      tolerabilityDelta,
      direction,
      tolerabilityDirection,
      risingTolerability,
      message,
    };
    if (bucket.medicationName) entry.medicationName = bucket.medicationName;
    perMedication.push(entry);
    void recentTotalCount;
  }

  perMedication.sort((a, b) => {
    // Most actionable first: rising tolerability > rising overall > everything else
    const aPri = (a.risingTolerability ? 2 : 0) + (a.direction === 'rising' ? 1 : 0);
    const bPri = (b.risingTolerability ? 2 : 0) + (b.direction === 'rising' ? 1 : 0);
    if (aPri !== bPri) return bPri - aPri;
    return (a.medicationName ?? a.medicationId).localeCompare(b.medicationName ?? b.medicationId);
  });

  const rising = perMedication.filter((m) => m.direction === 'rising');
  const risingTolerability = perMedication.filter((m) => m.risingTolerability);

  return {
    asOf: toIso(asOf),
    windowsDays,
    perMedication,
    rising,
    risingTolerability,
  };
}

/**
 * One-line headline for the regimen-wide rollup:
 *   "Refusal trend: 2 rising, 1 falling, 4 stable across 7 medications. 1 tolerability lead flagged."
 */
export function summarizeRefusalTrend(report: RefusalTrendReport): string {
  const total = report.perMedication.length;
  if (total === 0) return 'No refusal history available.';
  const rising = report.rising.length;
  const falling = report.perMedication.filter((m) => m.direction === 'falling').length;
  const stable = report.perMedication.filter((m) => m.direction === 'stable').length;
  const insufficient = report.perMedication.filter((m) => m.direction === 'insufficient').length;
  const tol = report.risingTolerability.length;
  const parts: string[] = [];
  if (rising) parts.push(`${rising} rising`);
  if (falling) parts.push(`${falling} falling`);
  if (stable) parts.push(`${stable} stable`);
  if (insufficient) parts.push(`${insufficient} with insufficient history`);
  let out = `Refusal trend: ${parts.join(', ')} across ${total} medication${total === 1 ? '' : 's'}.`;
  if (tol > 0) {
    out += ` ${tol} tolerability lead flag${tol === 1 ? '' : 's'} raised.`;
  }
  return out;
}
