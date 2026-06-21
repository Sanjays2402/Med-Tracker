/**
 * Dispensable-dose rounding.
 *
 * A prescriber calculates a dose (e.g. weight-based: 18 mg/kg of a 7.4 kg
 * infant = 133.2 mg of amoxicillin). That number is rarely directly
 * dispensable: tablets only come in 250 mg / 500 mg, liquids only have
 * an oral syringe granularity (typically 0.1 mL), an insulin pen only
 * dials in 0.5 unit increments.
 *
 * roundToDispensableDose chooses the closest dispensable amount to a target
 * dose while respecting:
 *   - the available unit ladder (tablets + halves/quarters when allowed,
 *     liquid syringe step, pen step, etc.),
 *   - hard safety floor (refuse to dispense above maxAllowed or below
 *     minAllowed even if the math is close),
 *   - the allowed deviation from target (default ±10%), beyond which the
 *     function returns an error rather than silently mis-dosing.
 *
 * Returns the rounded dose plus how to actually administer it (which
 * tablet sizes, how many of each), so the UI can render "give 1 x 500mg
 * + half of a 250mg" directly.
 *
 * Pure / deterministic. No I/O. Hardened for dosing safety.
 */

export type DispensableKind = 'tablet' | 'capsule' | 'liquid' | 'injection' | 'patch' | 'pen';

export interface TabletLadder {
  kind: 'tablet' | 'capsule';
  /** Available strengths, e.g. [250, 500, 1000] for amoxicillin. */
  strengths: number[];
  /** Which fractional pieces are allowed. 'whole' always allowed. */
  splits?: Array<'whole' | 'half' | 'quarter'>;
  /** Maximum number of single pieces in one administration. Default 4. */
  maxPiecesPerDose?: number;
}

export interface StepLadder {
  kind: 'liquid' | 'injection' | 'pen';
  /** Concentration in dose-units per mL (or per pen click). */
  concentrationPerMl?: number;
  /** Smallest dispensable step. Liquid syringes ~0.1, insulin pens 0.5. */
  step: number;
  /** Minimum/maximum dispensable single dose. */
  minStep?: number;
  maxStep?: number;
}

export type DoseLadder = TabletLadder | StepLadder;

export interface RoundingInput {
  /** Target dose computed from weight/age/etc. Same unit as ladder.strengths. */
  targetDose: number;
  ladder: DoseLadder;
  /** Absolute safety floor for the medication (refuse below). */
  minAllowed?: number;
  /** Absolute safety ceiling for the medication (refuse above). */
  maxAllowed?: number;
  /** Maximum allowed deviation from target as a fraction. Default 0.1 (10%). */
  maxDeviationRatio?: number;
}

export interface RoundedPiece {
  strength: number;
  fraction: 1 | 0.5 | 0.25;
  count: number;
}

export interface RoundedDose {
  targetDose: number;
  roundedDose: number;
  deviationRatio: number;
  pieces?: RoundedPiece[];
  /** For step ladders: number of steps and the resulting mL/units. */
  stepCount?: number;
  withinDeviation: boolean;
  withinSafetyBounds: boolean;
  reason: string;
}

const SPLIT_FRACTIONS: Record<'whole' | 'half' | 'quarter', 1 | 0.5 | 0.25> = {
  whole: 1, half: 0.5, quarter: 0.25,
};

function checkBounds(dose: number, input: RoundingInput): { ok: boolean; why?: string } {
  if (input.minAllowed != null && dose < input.minAllowed) {
    return { ok: false, why: `Below safety floor (${input.minAllowed}).` };
  }
  if (input.maxAllowed != null && dose > input.maxAllowed) {
    return { ok: false, why: `Above safety ceiling (${input.maxAllowed}).` };
  }
  return { ok: true };
}

function bestTabletCombo(
  target: number,
  ladder: TabletLadder,
): { pieces: RoundedPiece[]; dose: number } | null {
  const splits = ladder.splits ?? ['whole'];
  const maxPieces = ladder.maxPiecesPerDose ?? 4;
  const fractions = splits.map((s) => SPLIT_FRACTIONS[s]);
  // BFS-style enumeration: search all combinations up to maxPieces. The
  // search space is bounded (strengths * fractions * maxPieces) so this
  // stays tiny for normal regimens.
  let best: { pieces: RoundedPiece[]; dose: number } | null = null;
  // Use a recursive helper, exploring distinct (strength,fraction) buckets.
  const buckets: { strength: number; fraction: 1 | 0.5 | 0.25 }[] = [];
  for (const strength of [...ladder.strengths].sort((a, b) => b - a)) {
    for (const fraction of fractions) buckets.push({ strength, fraction });
  }
  function recurse(idx: number, remainingPieces: number, acc: RoundedPiece[], dose: number): void {
    const diff = Math.abs(dose - target);
    if (best == null || diff < Math.abs(best.dose - target) ||
        (diff === Math.abs(best.dose - target) && acc.reduce((s, p) => s + p.count, 0) < best.pieces.reduce((s, p) => s + p.count, 0))) {
      // Only record if dose > 0 (zero-piece combos aren't a dispense).
      if (acc.length > 0) best = { pieces: acc.map((p) => ({ ...p })), dose };
    }
    if (idx >= buckets.length || remainingPieces <= 0) return;
    const bucket = buckets[idx]!;
    const maxN = Math.min(remainingPieces, Math.ceil((target * 1.5) / (bucket.strength * bucket.fraction)) + 1);
    for (let n = 0; n <= maxN; n++) {
      if (n > 0) acc.push({ strength: bucket.strength, fraction: bucket.fraction, count: n });
      recurse(idx + 1, remainingPieces - n, acc, dose + n * bucket.strength * bucket.fraction);
      if (n > 0) acc.pop();
    }
  }
  recurse(0, maxPieces, [], 0);
  return best;
}

export function roundToDispensableDose(input: RoundingInput): RoundedDose {
  if (input.targetDose <= 0) throw new Error('targetDose must be positive');
  const maxDev = input.maxDeviationRatio ?? 0.1;

  if (input.ladder.kind === 'tablet' || input.ladder.kind === 'capsule') {
    const ladder = input.ladder;
    const best = bestTabletCombo(input.targetDose, ladder);
    if (!best) {
      return {
        targetDose: input.targetDose,
        roundedDose: 0,
        deviationRatio: 1,
        withinDeviation: false,
        withinSafetyBounds: false,
        reason: 'No dispensable combination found from the given strengths.',
      };
    }
    const dev = Math.abs(best.dose - input.targetDose) / input.targetDose;
    const bounds = checkBounds(best.dose, input);
    const withinDev = dev <= maxDev + 1e-9;
    return {
      targetDose: input.targetDose,
      roundedDose: best.dose,
      deviationRatio: Number(dev.toFixed(4)),
      pieces: best.pieces,
      withinDeviation: withinDev,
      withinSafetyBounds: bounds.ok,
      reason: !withinDev
        ? `Best combo deviates ${(dev * 100).toFixed(1)}% from target; exceeds ${(maxDev * 100).toFixed(0)}% allowed.`
        : !bounds.ok
          ? bounds.why!
          : `Rounded ${input.targetDose} -> ${best.dose} (${(dev * 100).toFixed(1)}% deviation).`,
    };
  }

  // Step ladder (liquid/injection/pen).
  const ladder = input.ladder as StepLadder;
  if (ladder.step <= 0) throw new Error('step must be positive');
  let stepCount = Math.round(input.targetDose / ladder.step);
  if (ladder.minStep != null) {
    const minN = Math.ceil(ladder.minStep / ladder.step);
    if (stepCount < minN) stepCount = minN;
  }
  if (ladder.maxStep != null) {
    const maxN = Math.floor(ladder.maxStep / ladder.step);
    if (stepCount > maxN) stepCount = maxN;
  }
  const rounded = stepCount * ladder.step;
  const dev = Math.abs(rounded - input.targetDose) / input.targetDose;
  const bounds = checkBounds(rounded, input);
  const withinDev = dev <= maxDev + 1e-9;
  return {
    targetDose: input.targetDose,
    roundedDose: Number(rounded.toFixed(6)),
    deviationRatio: Number(dev.toFixed(4)),
    stepCount,
    withinDeviation: withinDev,
    withinSafetyBounds: bounds.ok,
    reason: !withinDev
      ? `Nearest step deviates ${(dev * 100).toFixed(1)}% from target; exceeds ${(maxDev * 100).toFixed(0)}% allowed.`
      : !bounds.ok
        ? bounds.why!
        : `Rounded ${input.targetDose} -> ${rounded} (${stepCount} steps of ${ladder.step}).`,
  };
}
