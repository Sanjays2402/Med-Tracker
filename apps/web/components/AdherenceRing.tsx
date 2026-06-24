'use client';

import * as React from 'react';

/**
 * AdherenceRing — animated SVG donut.
 *
 * - Stroke length tweens to the target percentage over `animateMs`.
 * - 0/25/50/75 tick marks sit on the track for milestone reference.
 * - Tone derives from the percentage: ok >= 90, warn >= 70, danger otherwise.
 * - The center slot is a render prop, so callers can put anything in it
 *   (big number + label is the common case).
 * - Respects `prefers-reduced-motion` — no tween for users who prefer no motion.
 *
 * Sizing: caller passes the target pixel size; the SVG scales to it.
 * The component is a no-state, purely render-bound widget except for the
 * tween, which uses requestAnimationFrame.
 */

export interface AdherenceRingProps {
  /** 0..100 inclusive. Values outside are clamped. */
  percent: number;
  /** Total pixel size (width = height). Default 168. */
  size?: number;
  /** Stroke width in SVG units. Default 14. */
  stroke?: number;
  /** Override the auto-toned colour. */
  tone?: 'ok' | 'warn' | 'danger' | 'accent';
  /** Slot rendered in the centre of the ring. */
  children?: React.ReactNode;
  /** Tween duration, ms. Default 720. */
  animateMs?: number;
  /** aria-label for the SVG. Default "Adherence: N%". */
  label?: string;
  /** Show the 0/25/50/75 milestone tick marks. Default true. */
  showTicks?: boolean;
  /** Optional small subtitle below the center slot. */
  subtitle?: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function deriveTone(p: number): 'ok' | 'warn' | 'danger' {
  if (p >= 90) return 'ok';
  if (p >= 70) return 'warn';
  return 'danger';
}

function toneColour(t: 'ok' | 'warn' | 'danger' | 'accent'): { fg: string; bg: string } {
  switch (t) {
    case 'ok':     return { fg: 'var(--ok)',     bg: 'var(--ok-bg)' };
    case 'warn':   return { fg: 'var(--warn)',   bg: 'var(--warn-bg)' };
    case 'danger': return { fg: 'var(--danger)', bg: 'var(--danger-bg)' };
    case 'accent': return { fg: 'var(--accent)', bg: 'var(--accent-soft)' };
  }
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefers(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return prefers;
}

function useTween(target: number, animateMs: number, enabled: boolean): number {
  // Lock the initial value to 0 on first paint so the ring sweeps in from empty.
  const [value, setValue] = React.useState(enabled ? 0 : target);
  const rafRef = React.useRef<number | null>(null);
  const startRef = React.useRef(0);
  const fromRef = React.useRef(0);

  React.useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fromRef.current = value;
    startRef.current = performance.now();
    const from = fromRef.current;
    const dt = animateMs > 0 ? animateMs : 1;
    function step(now: number) {
      const t = Math.min(1, (now - startRef.current) / dt);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, animateMs, enabled]);

  return value;
}

export function AdherenceRing({
  percent,
  size = 168,
  stroke = 14,
  tone,
  children,
  animateMs = 720,
  label,
  showTicks = true,
  subtitle,
}: AdherenceRingProps) {
  const reducedMotion = usePrefersReducedMotion();
  const target = clamp01(percent);
  const animated = useTween(target, animateMs, !reducedMotion);
  const t = tone ?? deriveTone(target);
  const { fg } = toneColour(t);

  const viewSize = 100;
  const r = (viewSize - stroke) / 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (animated / 100) * circumference;
  const gap = circumference - dash;

  const titleText = label ?? `Adherence: ${Math.round(target)}%`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        width={size}
        height={size}
        role="img"
        aria-label={titleText}
        style={{ overflow: 'visible' }}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--bg-sunk)"
          strokeWidth={stroke}
        />
        {/* Milestone ticks (every 25%) */}
        {showTicks && (
          <g aria-hidden>
            {[0, 25, 50, 75].map((m) => {
              // 0% sits at the top (-90deg in SVG default-rotated coords)
              const angle = (m / 100) * 2 * Math.PI - Math.PI / 2;
              const inner = r - stroke / 2 - 0.6;
              const outer = r + stroke / 2 + 0.6;
              return (
                <line
                  key={m}
                  x1={cx + Math.cos(angle) * inner}
                  y1={cy + Math.sin(angle) * inner}
                  x2={cx + Math.cos(angle) * outer}
                  y2={cy + Math.sin(angle) * outer}
                  stroke="var(--line)"
                  strokeWidth={0.6}
                  opacity={0.7}
                />
              );
            })}
          </g>
        )}
        {/* Progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={fg}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          // Start the arc at the top (12 o'clock) and sweep clockwise.
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: reducedMotion ? 'stroke 200ms ease' : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {children ?? (
          <DefaultLabel percent={target} subtitle={subtitle} />
        )}
      </div>
    </div>
  );
}

function DefaultLabel({ percent, subtitle }: { percent: number; subtitle?: string }) {
  return (
    <>
      <div className="display text-[34px] leading-none tabular text-[var(--ink)]">
        {Math.round(percent)}
        <span className="text-[var(--ink-muted)] text-[18px] align-top ml-0.5">%</span>
      </div>
      {subtitle && (
        <div className="eyebrow mt-2">{subtitle}</div>
      )}
    </>
  );
}
