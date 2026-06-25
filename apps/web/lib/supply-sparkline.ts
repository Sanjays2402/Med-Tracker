/**
 * supply-sparkline — pure burndown-projection math for the medications list.
 *
 * Each medication row gets a tiny inline sparkline projecting how its remaining
 * supply burns down day by day until the bottle runs out. This module turns a
 * Medication (remainingDoses + schedule) into a set of SVG polyline points over
 * a fixed horizon, the run-out day, and a tone, so the row stays a thin render
 * and the projection stays unit-tested.
 *
 * Model: supply on day d = remainingDoses - d * dosesPerDay, clamped at 0. The
 * x-axis is a FIXED horizon (default 30 days) so steeper lines mean sooner
 * run-out and rows are visually comparable; the y-axis is normalised to each
 * med's own starting supply so every line starts at the top. No React and no
 * Date.now() — fully deterministic.
 */

import type { Medication } from './types';
import { dosesPerDay } from './medication-sort';

export interface SparklinePoint {
  /** Day offset from today (0 = today). */
  day: number;
  /** Projected doses remaining at the start of this day. */
  doses: number;
  /** SVG x coordinate (0..width). */
  x: number;
  /** SVG y coordinate (0 = full supply at top, height = empty at bottom). */
  y: number;
}

export type SupplyTone = 'ok' | 'warn' | 'danger';

export interface SupplySparkline {
  points: SparklinePoint[];
  /** `points`-attribute string for <polyline>, e.g. "0,0 3.2,9.3 ...". */
  polyline: string;
  /** Closed area path for a subtle fill under the line. */
  areaPath: string;
  /** Whole days of supply left = ceil(remainingDoses / dosesPerDay). */
  daysLeft: number;
  /** Doses consumed per active day (from the parsed schedule, min 1). */
  perDay: number;
  /** True when the bottle empties within the rendered horizon. */
  runsOutInWindow: boolean;
  /** Clamped x of the run-out crossing (only meaningful when in window). */
  runoutX: number;
  tone: SupplyTone;
  width: number;
  height: number;
}

export interface SparklineOptions {
  /** Days plotted on the x-axis. Default 30. */
  horizonDays?: number;
  width?: number;
  height?: number;
}

const DEFAULTS = { horizonDays: 30, width: 96, height: 28 } as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Tone from days of supply left. The danger threshold is the med's own
 * refillThresholdDays when present (so a 3-day antibiotic course and a 14-day
 * maintenance med flag at the right moment), else 7. Warn fires at 2x that.
 */
export function supplyTone(daysLeft: number, refillThresholdDays?: number): SupplyTone {
  const danger = refillThresholdDays && refillThresholdDays > 0 ? refillThresholdDays : 7;
  if (daysLeft <= danger) return 'danger';
  if (daysLeft <= danger * 2) return 'warn';
  return 'ok';
}

/**
 * Build the sparkline for a medication, or null when there is no usable supply
 * data (unknown or non-positive remainingDoses) so the caller can omit it.
 */
export function buildSupplySparkline(
  med: Medication,
  opts: SparklineOptions = {},
): SupplySparkline | null {
  const remaining = med.remainingDoses;
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining <= 0) {
    return null;
  }

  const horizonDays = Math.max(1, Math.floor(opts.horizonDays ?? DEFAULTS.horizonDays));
  const width = opts.width ?? DEFAULTS.width;
  const height = opts.height ?? DEFAULTS.height;
  const perDay = dosesPerDay(med.schedule);
  const daysLeft = Math.ceil(remaining / perDay);

  const points: SparklinePoint[] = [];
  for (let day = 0; day <= horizonDays; day++) {
    const doses = Math.max(0, remaining - day * perDay);
    const x = round2((day / horizonDays) * width);
    const y = round2(height * (1 - doses / remaining));
    points.push({ day, doses: round2(doses), x, y });
  }

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const areaPath =
    `M ${first.x},${first.y} ` +
    points
      .slice(1)
      .map((p) => `L ${p.x},${p.y}`)
      .join(' ') +
    ` L ${last.x},${height} L ${first.x},${height} Z`;

  const runsOutInWindow = daysLeft <= horizonDays;
  const runoutX = round2((Math.min(daysLeft, horizonDays) / horizonDays) * width);

  return {
    points,
    polyline,
    areaPath,
    daysLeft,
    perDay,
    runsOutInWindow,
    runoutX,
    tone: supplyTone(daysLeft, med.refillThresholdDays),
    width,
    height,
  };
}
