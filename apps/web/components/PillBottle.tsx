'use client';

import * as React from 'react';
import { computeBottleFill, bottleToneVars, type BottleFillOptions } from '../lib/bottle-fill';

/**
 * PillBottle — a small vertical "pill bottle" gauge whose liquid fills with
 * sage proportional to supply remaining, and turns coral once at/under the
 * refill threshold. Pure presentation: all thresholds come from
 * computeBottleFill so the visual stays consistent with the tested logic.
 *
 * The bottle is drawn in an SVG: a cap, a body with a rounded base, a clipped
 * liquid rect that animates its height via a CSS transition, and a subtle fill
 * line. Respects prefers-reduced-motion through the global CSS reset (the
 * transition is cosmetic; the static height is always correct).
 */

export interface PillBottleProps {
  remaining: number;
  capacity: number;
  /** Low-water threshold in the same unit as remaining/capacity. */
  lowAt?: number;
  /** Pixel width. Height is derived ~2.4x. Default 34. */
  width?: number;
  /** Accessible label override. */
  label?: string;
}

export function PillBottle({ remaining, capacity, lowAt, width = 34, label }: PillBottleProps) {
  const opts: BottleFillOptions = lowAt === undefined ? {} : { lowAt };
  const fill = computeBottleFill(remaining, capacity, opts);
  const { liquid, soft } = bottleToneVars(fill.tone);

  // SVG geometry (viewBox 0..40 wide, 0..96 tall).
  const W = 40;
  const H = 96;
  const capH = 12;
  const neckY = capH;
  const bodyTop = neckY + 6;
  const bodyBottom = H - 4;
  const bodyH = bodyBottom - bodyTop;
  const liquidH = bodyH * fill.fraction;
  const liquidY = bodyBottom - liquidH;

  const height = Math.round(width * (H / W));
  const aria =
    label ?? `${fill.percent}% of supply remaining${fill.belowThreshold ? ', refill soon' : ''}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={aria}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <clipPath id={`bottle-body-${idFor(remaining, capacity)}`}>
          <rect x={6} y={bodyTop} width={W - 12} height={bodyH} rx={7} />
        </clipPath>
      </defs>

      {/* Cap */}
      <rect x={11} y={2} width={W - 22} height={capH} rx={3} fill="var(--line)" />

      {/* Body outline + empty track */}
      <rect
        x={6}
        y={bodyTop}
        width={W - 12}
        height={bodyH}
        rx={7}
        fill="var(--bg-sunk)"
        stroke="var(--line)"
        strokeWidth={1.2}
      />

      {/* Liquid */}
      <g clipPath={`url(#bottle-body-${idFor(remaining, capacity)})`}>
        <rect
          x={6}
          y={liquidY}
          width={W - 12}
          height={liquidH + 2}
          fill={liquid}
          style={{ transition: 'y 480ms cubic-bezier(.22,1,.36,1), height 480ms cubic-bezier(.22,1,.36,1)' }}
        />
        {/* fill-line highlight */}
        {fill.fraction > 0 && fill.fraction < 1 && (
          <rect x={6} y={liquidY} width={W - 12} height={1.5} fill={soft} opacity={0.9} />
        )}
      </g>

      {/* Label band (a faux prescription label) */}
      <rect
        x={9}
        y={bodyTop + bodyH * 0.34}
        width={W - 18}
        height={bodyH * 0.30}
        rx={2}
        fill="var(--bg-elev)"
        opacity={0.82}
      />
      <line x1={12} y1={bodyTop + bodyH * 0.44} x2={W - 12} y2={bodyTop + bodyH * 0.44} stroke="var(--line)" strokeWidth={1} />
      <line x1={12} y1={bodyTop + bodyH * 0.52} x2={W - 15} y2={bodyTop + bodyH * 0.52} stroke="var(--line)" strokeWidth={1} />
    </svg>
  );
}

// Deterministic, collision-safe-enough id so two bottles' clipPaths don't clash.
function idFor(a: number, b: number): string {
  return `${Math.round(a * 100)}x${Math.round(b * 100)}`;
}
