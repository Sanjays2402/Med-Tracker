/**
 * Tapering plan generator.
 *
 * Builds a step-down schedule for medications that must be withdrawn
 * gradually (SSRIs, benzodiazepines, opioids, corticosteroids, beta
 * blockers). The output is a series of phases, each with a target
 * daily dose, the duration to hold that dose, and the actual unit
 * decomposition the patient will swallow given allowed pill strengths.
 *
 * Two reduction shapes are supported:
 *
 *   - "linear":      subtract a fixed mg amount each step.
 *   - "exponential": multiply by a fixed factor each step (typical for
 *                    benzodiazepines where each cut is X% of the
 *                    *current* dose, not the starting dose).
 *
 * The generator enforces:
 *
 *   - dose >= endDoseMg at every step;
 *   - each step is representable as a non-negative integer combo of
 *     `allowedStrengthsMg` (e.g. 10mg + 5mg + 2.5mg tablets) within
 *     `roundingToleranceMg`;
 *   - optional `holdEveryNSteps` adds a longer stabilization phase
 *     periodically, useful for slow tapers.
 *
 * Pure, deterministic, no I/O.
 */

export type TaperShape = 'linear' | 'exponential';

export interface TaperRequest {
  medicationId: string;
  startDoseMg: number;
  endDoseMg: number;
  shape: TaperShape;
  /** Linear: mg to remove per step. Exponential: fractional cut (0 < r < 1), e.g. 0.1 = drop 10%. */
  stepSize: number;
  /** Days each ordinary step is held. */
  stepDurationDays: number;
  /** Pill/tablet strengths available, in mg. */
  allowedStrengthsMg: number[];
  /** Tolerance when matching target dose to a strength combo. Default 0.5 * smallest strength. */
  roundingToleranceMg?: number;
  /** If set, every Nth step is replaced by a longer "hold" of `holdDurationDays`. */
  holdEveryNSteps?: number;
  holdDurationDays?: number;
  /** Hard cap on total steps to avoid runaway exponential tapers. Default 60. */
  maxSteps?: number;
}

export interface TaperPhase {
  step: number;
  targetDoseMg: number;
  /** Actual dose the patient will take (sum of `units`). */
  actualDoseMg: number;
  /** Strength -> count, sorted by strength desc. */
  units: { strengthMg: number; count: number }[];
  durationDays: number;
  hold: boolean;
}

export interface TaperPlan {
  medicationId: string;
  startDoseMg: number;
  endDoseMg: number;
  shape: TaperShape;
  totalDays: number;
  phases: TaperPhase[];
  /** True if endDoseMg was reached exactly (within tolerance). */
  completed: boolean;
}

/**
 * Decompose `targetMg` into a non-negative integer combination of
 * `strengths` using a greedy descending fit. Returns null if no
 * combination is within `tolerance`.
 */
function decompose(
  targetMg: number,
  strengths: number[],
  tolerance: number,
): { strengthMg: number; count: number }[] | null {
  if (targetMg <= tolerance) return [];
  const sorted = [...strengths].sort((a, b) => b - a);
  // Greedy is optimal when each strength is an integer multiple of the next
  // smallest; for arbitrary strengths we fall back to a small bounded search.
  const greedy: Record<number, number> = {};
  let remaining = targetMg;
  for (const s of sorted) {
    const n = Math.floor((remaining + 1e-9) / s);
    if (n > 0) {
      greedy[s] = n;
      remaining -= n * s;
    }
  }
  if (Math.abs(remaining) <= tolerance) {
    return Object.entries(greedy)
      .map(([k, v]) => ({ strengthMg: Number(k), count: v }))
      .sort((a, b) => b.strengthMg - a.strengthMg);
  }
  // Bounded search: try 0..ceil(target/min) of each strength. Cap to keep cheap.
  const min = sorted[sorted.length - 1];
  const maxCount = Math.min(20, Math.ceil(targetMg / min) + 2);
  let best: { combo: Record<number, number>; diff: number } | null = null;
  const recurse = (i: number, acc: Record<number, number>, sum: number) => {
    if (i === sorted.length) {
      const diff = Math.abs(sum - targetMg);
      if (diff <= tolerance && (best === null || diff < best.diff)) {
        best = { combo: { ...acc }, diff };
      }
      return;
    }
    const s = sorted[i];
    const upper = Math.min(maxCount, Math.ceil((targetMg - sum + tolerance) / s) + 1);
    for (let n = 0; n <= upper; n++) {
      acc[s] = n;
      recurse(i + 1, acc, sum + n * s);
    }
    delete acc[s];
  };
  recurse(0, {}, 0);
  if (!best) return null;
  return Object.entries(best.combo)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ strengthMg: Number(k), count: v }))
    .sort((a, b) => b.strengthMg - a.strengthMg);
}

function sumDose(units: { strengthMg: number; count: number }[]): number {
  return units.reduce((s, u) => s + u.strengthMg * u.count, 0);
}

export function generateTaperPlan(req: TaperRequest): TaperPlan {
  if (req.startDoseMg <= 0) throw new Error('startDoseMg must be positive');
  if (req.endDoseMg < 0) throw new Error('endDoseMg must be non-negative');
  if (req.endDoseMg > req.startDoseMg) throw new Error('endDoseMg must be <= startDoseMg');
  if (req.allowedStrengthsMg.length === 0) throw new Error('allowedStrengthsMg required');
  if (req.shape === 'linear' && req.stepSize <= 0) throw new Error('linear stepSize must be > 0');
  if (req.shape === 'exponential' && (req.stepSize <= 0 || req.stepSize >= 1)) {
    throw new Error('exponential stepSize must be in (0,1)');
  }
  if (req.holdEveryNSteps !== undefined && req.holdEveryNSteps <= 0) {
    throw new Error('holdEveryNSteps must be > 0 when set');
  }
  if (req.holdEveryNSteps !== undefined && (req.holdDurationDays ?? 0) <= 0) {
    throw new Error('holdDurationDays must be > 0 when holdEveryNSteps set');
  }

  const minStrength = Math.min(...req.allowedStrengthsMg);
  const tolerance = req.roundingToleranceMg ?? minStrength / 2;
  const maxSteps = req.maxSteps ?? 60;

  const phases: TaperPhase[] = [];
  let current = req.startDoseMg;
  let step = 0;

  while (current > req.endDoseMg + tolerance && step < maxSteps) {
    step += 1;
    let target =
      req.shape === 'linear' ? current - req.stepSize : current * (1 - req.stepSize);
    if (target < req.endDoseMg) target = req.endDoseMg;

    let units = decompose(target, req.allowedStrengthsMg, tolerance);
    // If exponential cut undershoots achievable dose (smaller than minStrength), snap to end.
    if (!units) {
      if (target < minStrength - tolerance) {
        target = req.endDoseMg;
        units = decompose(target, req.allowedStrengthsMg, tolerance);
      }
    }
    if (!units) {
      // Cannot represent: stop tapering further; final phase already added.
      break;
    }
    const actual = sumDose(units);
    // Avoid emitting a no-op phase (target rounded back to current).
    if (Math.abs(actual - current) <= tolerance / 2 && actual > req.endDoseMg + tolerance) {
      break;
    }

    const isHold =
      req.holdEveryNSteps !== undefined && step % req.holdEveryNSteps === 0;
    phases.push({
      step,
      targetDoseMg: round3(target),
      actualDoseMg: round3(actual),
      units,
      durationDays: isHold ? (req.holdDurationDays as number) : req.stepDurationDays,
      hold: isHold,
    });
    current = actual;
  }

  // Ensure final phase lands at endDoseMg if not already there.
  if (Math.abs(current - req.endDoseMg) > tolerance && step < maxSteps) {
    const units = decompose(req.endDoseMg, req.allowedStrengthsMg, tolerance);
    if (units !== null) {
      step += 1;
      phases.push({
        step,
        targetDoseMg: req.endDoseMg,
        actualDoseMg: sumDose(units),
        units,
        durationDays: req.stepDurationDays,
        hold: false,
      });
      current = sumDose(units);
    }
  }

  const totalDays = phases.reduce((s, p) => s + p.durationDays, 0);
  return {
    medicationId: req.medicationId,
    startDoseMg: req.startDoseMg,
    endDoseMg: req.endDoseMg,
    shape: req.shape,
    totalDays,
    phases,
    completed: Math.abs(current - req.endDoseMg) <= tolerance,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
