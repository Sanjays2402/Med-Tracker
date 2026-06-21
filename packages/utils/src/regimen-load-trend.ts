/**
 * Regimen-load trend.
 *
 * `regimen-load-score` produces a point-in-time burden number
 * (0..100). It's the right thing for "what does the regimen look
 * like today?" — but a de-prescribing review is more compelling
 * when it can say "your treatment burden has climbed 40% in the
 * last 6 months". A 62/100 score today is one signal; a 62/100
 * after a steady 8 -> 62 climb is a different conversation.
 *
 * This module composes on archived RegimenLoadScore snapshots
 * (typically one per week or one per month from a nightly cron)
 * and reports per-window mean / latest / delta / slope across the
 * configured rolling windows. Mirrors pdc-trend's structure
 * deliberately so the UI can render both with the same chart
 * component.
 *
 * Notable design choices:
 *
 *   - We do NOT recompute scores here. Snapshots are the input.
 *     Recomputing would require historical pill-burden + cost
 *     state which the runtime doesn't preserve.
 *   - Each window's number is the MEAN of in-window snapshots, not
 *     the latest snapshot inside the window. The mean is more
 *     robust against a single-day cost spike (a once-a-year
 *     deductible reset that doesn't reflect the steady-state
 *     burden).
 *   - Direction uses the same stableBandDelta language as pdc-trend
 *     but on a 0..100 scale (default 5 points). Below that the
 *     trend is "stable" regardless of slope sign.
 *   - A snapshot per-component series is exposed so the UI can
 *     show "your dosing burden climbed but pill burden held
 *     steady" — the most actionable de-prescribing tell.
 *
 * Pure / deterministic. No I/O.
 */

import { addDays, startOfDay } from './date';
import type { RegimenLoadScore, RegimenLoadBand } from './regimen-load-score';

export interface RegimenLoadSnapshot {
  /** When the snapshot was taken (ISO date or full ISO datetime). */
  takenAt: string;
  score: RegimenLoadScore;
}

export interface RegimenLoadTrendOptions {
  /**
   * Reference date for every window. The window of length `windowDays`
   * is [asOf - windowDays + 1, asOf] inclusive. Default: today (local).
   */
  asOf?: Date;
  /**
   * Window lengths in days. Default [30, 90, 180] — month / quarter
   * / half-year for de-prescribing review cadence.
   */
  windowsDays?: number[];
  /**
   * Minimum absolute delta (0..100 scale) for the trend to be
   * non-stable. Default 5 points. Below this we report 'stable'.
   */
  stableBandDelta?: number;
  /**
   * Minimum snapshots in the LARGEST window before any trend is
   * computed. Default 2 — anything less is reported as 'insufficient'.
   */
  minSnapshots?: number;
}

export type RegimenLoadTrendDirection =
  | 'rising'
  | 'falling'
  | 'stable'
  | 'insufficient';

export interface RegimenLoadWindow {
  windowDays: number;
  measurementStart: string;
  measurementEnd: string;
  /** Number of snapshots inside this window. */
  snapshotCount: number;
  /** Mean composite score across in-window snapshots (0..100). */
  meanTotal: number;
  /** Band of the mean total. */
  meanBand: RegimenLoadBand;
  /** Per-component mean (0..100 each). */
  meanComponents: {
    dosing: number;
    pills: number;
    monitoring: number;
    cost: number;
    prn: number;
  };
}

export interface RegimenLoadTrend {
  asOf: string;
  windowsDays: number[];
  windows: RegimenLoadWindow[];
  /** Latest = shortest window mean. */
  latestTotal: number | null;
  /** Baseline = longest window mean. */
  baselineTotal: number | null;
  /** latestTotal - baselineTotal. Positive when burden RISING. */
  delta: number | null;
  /** OLS slope of meanTotal vs windowDays (per day). */
  slopePerDay: number | null;
  direction: RegimenLoadTrendDirection;
  /** Plain-English headline message. */
  message: string;
  /** Per-component direction for the dashboard "what drove the climb?" panel. */
  componentDirections: {
    dosing: RegimenLoadTrendDirection;
    pills: RegimenLoadTrendDirection;
    monitoring: RegimenLoadTrendDirection;
    cost: RegimenLoadTrendDirection;
    prn: RegimenLoadTrendDirection;
  };
  /** Component deltas (latest - baseline) for each component. */
  componentDeltas: {
    dosing: number | null;
    pills: number | null;
    monitoring: number | null;
    cost: number | null;
    prn: number | null;
  };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bandFor(total: number): RegimenLoadBand {
  if (total < 25) return 'light';
  if (total < 50) return 'moderate';
  if (total < 75) return 'heavy';
  return 'severe';
}

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

function classifyDirection(
  delta: number | null,
  hasMinSnapshots: boolean,
  stableBand: number,
): RegimenLoadTrendDirection {
  if (delta === null || !hasMinSnapshots) return 'insufficient';
  if (Math.abs(delta) < stableBand) return 'stable';
  // Higher score = more burden. Rising = bad.
  return delta > 0 ? 'rising' : 'falling';
}

function describe(
  direction: RegimenLoadTrendDirection,
  latest: number | null,
  baseline: number | null,
  longestWindow: number,
): string {
  if (direction === 'insufficient' || latest === null || baseline === null) {
    return 'Not enough snapshots to compute a trend.';
  }
  const lp = Math.round(latest);
  const bp = Math.round(baseline);
  if (direction === 'stable') return `Stable around ${lp}/100.`;
  if (direction === 'rising') return `Rising (${bp} -> ${lp} over ${longestWindow}d).`;
  return `Falling (${bp} -> ${lp} over ${longestWindow}d).`;
}

interface Aggregate {
  count: number;
  total: number;
  dosing: number;
  pills: number;
  monitoring: number;
  cost: number;
  prn: number;
}

function emptyAggregate(): Aggregate {
  return { count: 0, total: 0, dosing: 0, pills: 0, monitoring: 0, cost: 0, prn: 0 };
}

function addToAggregate(agg: Aggregate, score: RegimenLoadScore): void {
  agg.count += 1;
  agg.total += score.total;
  agg.dosing += score.components.dosing.score;
  agg.pills += score.components.pills.score;
  agg.monitoring += score.components.monitoring.score;
  agg.cost += score.components.cost.score;
  agg.prn += score.components.prn.score;
}

function aggregateToWindow(
  agg: Aggregate,
  windowDays: number,
  measurementStart: string,
  measurementEnd: string,
): RegimenLoadWindow {
  if (agg.count === 0) {
    return {
      windowDays,
      measurementStart,
      measurementEnd,
      snapshotCount: 0,
      meanTotal: 0,
      meanBand: 'light',
      meanComponents: { dosing: 0, pills: 0, monitoring: 0, cost: 0, prn: 0 },
    };
  }
  const meanTotal = agg.total / agg.count;
  return {
    windowDays,
    measurementStart,
    measurementEnd,
    snapshotCount: agg.count,
    meanTotal,
    meanBand: bandFor(meanTotal),
    meanComponents: {
      dosing: agg.dosing / agg.count,
      pills: agg.pills / agg.count,
      monitoring: agg.monitoring / agg.count,
      cost: agg.cost / agg.count,
      prn: agg.prn / agg.count,
    },
  };
}

/**
 * Compute the regimen-load trend across rolling windows from a
 * list of archived snapshots. Snapshots whose `takenAt` is later
 * than `asOf` are ignored (caller's snapshot pipeline may include
 * future-scheduled rows; we never project forward). Snapshots
 * with an unparseable `takenAt` are silently dropped.
 *
 * Each window's `meanTotal` is the arithmetic mean across snapshots
 * whose `takenAt` falls inside [asOf - windowDays + 1, asOf]. Empty
 * windows contribute zero counts and a 0-score row so the UI can
 * render the slot consistently.
 */
export function computeRegimenLoadTrend(
  snapshots: RegimenLoadSnapshot[],
  options: RegimenLoadTrendOptions = {},
): RegimenLoadTrend {
  const asOf = startOfDay(options.asOf ?? new Date());
  const windowsDays = (options.windowsDays ?? [30, 90, 180])
    .filter((d) => Number.isFinite(d) && d > 0)
    .map((d) => Math.floor(d))
    .sort((a, b) => a - b);
  const stableBand = Math.max(0, options.stableBandDelta ?? 5);
  const minSnapshots = Math.max(1, options.minSnapshots ?? 2);

  if (windowsDays.length === 0) {
    return {
      asOf: toIsoDate(asOf),
      windowsDays: [],
      windows: [],
      latestTotal: null,
      baselineTotal: null,
      delta: null,
      slopePerDay: null,
      direction: 'insufficient',
      message: 'Not enough snapshots to compute a trend.',
      componentDirections: {
        dosing: 'insufficient',
        pills: 'insufficient',
        monitoring: 'insufficient',
        cost: 'insufficient',
        prn: 'insufficient',
      },
      componentDeltas: { dosing: null, pills: null, monitoring: null, cost: null, prn: null },
    };
  }

  const asOfMs = asOf.getTime();
  // Snapshot stream sorted by takenAt asc.
  type Parsed = { ms: number; iso: string; score: RegimenLoadScore };
  const parsed: Parsed[] = [];
  for (const s of snapshots) {
    const ms = Date.parse(s.takenAt);
    if (!Number.isFinite(ms)) continue;
    const day = startOfDay(new Date(ms));
    const dayMs = day.getTime();
    if (dayMs > asOfMs) continue; // never project forward
    parsed.push({ ms: dayMs, iso: toIsoDate(day), score: s.score });
  }
  parsed.sort((a, b) => a.ms - b.ms);

  const windows: RegimenLoadWindow[] = [];
  for (const w of windowsDays) {
    const start = addDays(asOf, -(w - 1));
    const startMs = start.getTime();
    const agg = emptyAggregate();
    for (const p of parsed) {
      if (p.ms < startMs) continue;
      if (p.ms > asOfMs) continue;
      addToAggregate(agg, p.score);
    }
    windows.push(aggregateToWindow(agg, w, toIsoDate(start), toIsoDate(asOf)));
  }

  // Largest window snapshot count gates the trend. We also count the
  // number of DISTINCT days of snapshot inside the largest window —
  // a single snapshot replicated across overlapping windows is not a
  // trend, it's a single data point.
  const largest = windows[windows.length - 1]!;
  const distinctDays = new Set<number>();
  const largestStartMs = addDays(asOf, -(largest.windowDays - 1)).getTime();
  for (const p of parsed) {
    if (p.ms >= largestStartMs && p.ms <= asOfMs) distinctDays.add(p.ms);
  }
  const hasMin = largest.snapshotCount >= minSnapshots && distinctDays.size >= 2;

  const realPoints = windows.filter((w) => w.snapshotCount > 0);
  let latestTotal: number | null = null;
  let baselineTotal: number | null = null;
  let delta: number | null = null;
  let slopePerDay: number | null = null;

  if (realPoints.length > 0) {
    latestTotal = windows[0]!.snapshotCount > 0 ? windows[0]!.meanTotal : null;
    baselineTotal = largest.snapshotCount > 0 ? largest.meanTotal : null;
    if (latestTotal !== null && baselineTotal !== null) {
      delta = latestTotal - baselineTotal;
    }
    slopePerDay = linearSlope(realPoints.map((w) => ({ x: w.windowDays, y: w.meanTotal })));
  }

  const direction = classifyDirection(delta, hasMin && realPoints.length >= 2, stableBand);

  const longestWindow = windowsDays[windowsDays.length - 1]!;
  const message = describe(direction, latestTotal, baselineTotal, longestWindow);

  type ComponentKey = 'dosing' | 'pills' | 'monitoring' | 'cost' | 'prn';
  const componentKeys: ComponentKey[] = ['dosing', 'pills', 'monitoring', 'cost', 'prn'];
  const componentDirections = {} as RegimenLoadTrend['componentDirections'];
  const componentDeltas = {} as RegimenLoadTrend['componentDeltas'];
  for (const k of componentKeys) {
    if (windows[0]!.snapshotCount > 0 && largest.snapshotCount > 0) {
      const cDelta = windows[0]!.meanComponents[k] - largest.meanComponents[k];
      componentDeltas[k] = cDelta;
      componentDirections[k] = classifyDirection(
        cDelta,
        hasMin && realPoints.length >= 2,
        stableBand,
      );
    } else {
      componentDeltas[k] = null;
      componentDirections[k] = 'insufficient';
    }
  }

  return {
    asOf: toIsoDate(asOf),
    windowsDays,
    windows,
    latestTotal,
    baselineTotal,
    delta,
    slopePerDay,
    direction,
    message,
    componentDirections,
    componentDeltas,
  };
}

/**
 * Pick the top-N components whose mean burden is RISING fastest
 * (positive delta) across the trend, sorted by delta desc. Useful
 * for the "what drove the climb?" panel — typically rendered as
 * a horizontal bar chart with this list.
 *
 * Returns an empty array when the overall direction is insufficient
 * (no point in cherry-picking components when the trend itself
 * isn't trustworthy).
 */
export function topRisingComponents(
  trend: RegimenLoadTrend,
  topN = 3,
): Array<{
  component: 'dosing' | 'pills' | 'monitoring' | 'cost' | 'prn';
  delta: number;
}> {
  if (trend.direction === 'insufficient') return [];
  const entries = Object.entries(trend.componentDeltas) as Array<
    ['dosing' | 'pills' | 'monitoring' | 'cost' | 'prn', number | null]
  >;
  const positive = entries
    .filter(([, d]) => d !== null && d > 0)
    .map(([k, d]) => ({ component: k, delta: d as number }))
    .sort((a, b) => b.delta - a.delta);
  return positive.slice(0, Math.max(0, topN | 0));
}
