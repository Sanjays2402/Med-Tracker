'use client';

import * as React from 'react';
import { buildSupplySparkline, type SupplyTone } from '../lib/supply-sparkline';
import type { Medication } from '../lib/types';

/**
 * SupplySparkline — a tiny inline supply-burndown sparkline for a medication.
 *
 * Renders a pure SVG polyline projecting how the medication's remaining supply
 * burns down to its run-out day over a fixed horizon. The line is tinted to the
 * supply tone (sage ok / amber warn / coral danger), with a soft area fill and
 * a small marker where the bottle hits empty. Returns null when there is no
 * usable supply data so a med without a count simply shows nothing.
 *
 * All projection math lives in lib/supply-sparkline.ts (unit-tested); this is a
 * thin presentational wrapper.
 */

const TONE_STROKE: Record<SupplyTone, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};

export function SupplySparkline({
  med,
  horizonDays = 30,
  width = 92,
  height = 26,
  className = '',
}: {
  med: Medication;
  horizonDays?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const spark = React.useMemo(
    () => buildSupplySparkline(med, { horizonDays, width, height }),
    [med, horizonDays, width, height],
  );
  if (!spark) return null;

  const stroke = TONE_STROKE[spark.tone];
  const gradId = `spark-${med.id}`;
  const runoutY = spark.runsOutInWindow ? spark.height : null;

  const title = spark.runsOutInWindow
    ? `About ${spark.daysLeft} day${spark.daysLeft === 1 ? '' : 's'} of supply left`
    : `More than ${horizonDays} days of supply left`;

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="img"
      aria-label={title}
      style={{ overflow: 'visible' }}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* baseline */}
      <line
        x1={0}
        y1={height}
        x2={width}
        y2={height}
        stroke="var(--line-soft)"
        strokeWidth={1}
      />

      {/* area fill under the burndown line */}
      <path d={spark.areaPath} fill={`url(#${gradId})`} />

      {/* the burndown line */}
      <polyline
        points={spark.polyline}
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* run-out marker where the bottle hits empty (only when within horizon) */}
      {runoutY !== null && (
        <circle
          cx={spark.runoutX}
          cy={runoutY}
          r={2.5}
          fill="var(--bg-elev)"
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
