/**
 * Tablet-splitting plan.
 *
 * When the prescribed dose doesn't match a manufactured strength, the
 * patient is asked to split a tablet. That sounds simple but it has
 * specific safety rules:
 *
 *   - Only tablets marked `scored` may be split (extended-release and
 *     enteric-coated tablets are NOT splittable without breaking the
 *     mechanism). Capsules are never split.
 *   - Only halves are reliably reproducible without a pill cutter;
 *     quarters require both `scored=true` AND `crossScored=true` (a
 *     deep cross score that lines up two perpendicular cuts).
 *   - Sub-quarter splits are unreliable and should be refused.
 *   - The patient should NOT be asked to take more than `maxPiecesPerDose`
 *     individual pieces per administration (default 4) — usability cap.
 *
 * planPillSplit accepts an array of available tablet strengths (with
 * scored flags) and a target dose. It returns the cleanest plan that
 * sums to the target, plus a list of safety warnings if any.
 *
 * Composes with dose-rounding: dose-rounding picks the best dispensable
 * amount across multiple strengths; this module specialises on splitting
 * a SINGLE strength when the prescriber wrote "1/2 of a 10mg tablet"
 * style instructions. dose-rounding's bestTabletCombo handles the
 * multi-strength case; planPillSplit answers "how do I cleanly split
 * THIS tablet?".
 *
 * Pure / deterministic. No I/O. Hardened for dosing safety.
 */

export interface TabletOption {
  /** Manufactured strength in dose units (mg, mcg, etc.). */
  strength: number;
  /** True if the tablet is scored (single line down the middle). */
  scored: boolean;
  /** True if the tablet has a cross score (two perpendicular lines). */
  crossScored?: boolean;
  /**
   * Extended-release / enteric-coated tablets cannot be split safely
   * regardless of scoring. Set true for any non-immediate-release form.
   */
  extendedRelease?: boolean;
  /** Optional label for the UI ("metoprolol 25mg ER"). */
  label?: string;
}

export interface PillCutterPlanInput {
  /** Target dose. Same unit as TabletOption.strength. */
  targetDose: number;
  /** Available manufactured strengths. */
  tablets: TabletOption[];
  /**
   * Max number of physical pieces per single administration. Default 4.
   * (A patient asked to take "8 quarter-pieces" will get something wrong.)
   */
  maxPiecesPerDose?: number;
  /**
   * Maximum allowed deviation from target as a fraction. Default 0.05
   * (5%) — tighter than dose-rounding's default because splitting math
   * is more error-prone in real-world execution.
   */
  maxDeviationRatio?: number;
}

export type PieceSize = 'whole' | 'half' | 'quarter';

export interface CutterPiece {
  strength: number;
  size: PieceSize;
  count: number;
  /** Resulting dose contribution from this entry. */
  contributionMg: number;
  label?: string;
}

export type CutterWarningKind =
  | 'not-scored'
  | 'no-cross-score'
  | 'extended-release'
  | 'too-many-pieces'
  | 'sub-quarter'
  | 'unsplittable-only-option';

export interface CutterWarning {
  kind: CutterWarningKind;
  /** Strength of the tablet that triggered the warning. */
  strength: number;
  /** Human-readable note for the UI/pharmacist review. */
  note: string;
}

export interface PillCutterPlan {
  targetDose: number;
  /** Best achievable dose given the constraints. */
  achievedDose: number;
  /** Deviation as a signed fraction (achieved - target) / target. */
  deviationRatio: number;
  /** Plan pieces, sorted by strength descending then size descending. */
  pieces: CutterPiece[];
  /** Total physical pieces the patient must produce per dose. */
  pieceCount: number;
  /** Whether the plan meets the deviation cap AND has zero blocking warnings. */
  feasible: boolean;
  /** Safety warnings: blocking ones make feasible=false. */
  warnings: CutterWarning[];
  /** Plain-language instruction, e.g. "Take 1 whole 10mg + half of a 5mg." */
  instruction: string;
}

const SIZE_FACTOR: Record<PieceSize, 1 | 0.5 | 0.25> = {
  whole: 1,
  half: 0.5,
  quarter: 0.25,
};

const BLOCKING_KINDS = new Set<CutterWarningKind>([
  'extended-release',
  'not-scored',
  'no-cross-score',
  'sub-quarter',
  'too-many-pieces',
  'unsplittable-only-option',
]);

/**
 * Decide which sizes are legitimately usable for a given tablet.
 * `whole` is always allowed (no cut). `half` requires scored=true.
 * `quarter` requires scored AND crossScored. Returns the warnings that
 * would be raised if a forbidden size were attempted.
 */
function allowedSizes(t: TabletOption): { sizes: PieceSize[]; warnings: CutterWarning[] } {
  const sizes: PieceSize[] = ['whole'];
  const warnings: CutterWarning[] = [];
  if (t.extendedRelease) {
    warnings.push({
      kind: 'extended-release',
      strength: t.strength,
      note: `${labelOf(t)} is extended-release; do not split.`,
    });
    return { sizes, warnings };
  }
  if (t.scored) sizes.push('half');
  if (t.scored && t.crossScored) sizes.push('quarter');
  return { sizes, warnings };
}

function labelOf(t: TabletOption): string {
  return t.label ?? `${t.strength}mg tablet`;
}

/**
 * Enumerate combinations of (tablet, size, count) summing close to the
 * target. Search space is small (tablets * sizes * maxPieces) so an
 * exhaustive search is fine.
 *
 * Returns the combo with the smallest absolute deviation; on ties,
 * prefer fewer physical pieces, then fewer cuts (whole > half > quarter).
 */
function enumerateCombos(
  input: PillCutterPlanInput,
  options: { allowAllSizes: boolean },
): { pieces: CutterPiece[]; dose: number; physical: number; cutCost: number } | null {
  const maxPieces = input.maxPiecesPerDose ?? 4;
  type Bucket = { tablet: TabletOption; size: PieceSize; doseUnit: number };
  const buckets: Bucket[] = [];

  for (const tablet of input.tablets) {
    const { sizes } = allowedSizes(tablet);
    const effectiveSizes = options.allowAllSizes ? (['whole', 'half', 'quarter'] as PieceSize[]) : sizes;
    for (const size of effectiveSizes) {
      buckets.push({ tablet, size, doseUnit: tablet.strength * SIZE_FACTOR[size] });
    }
  }
  if (buckets.length === 0) return null;

  let best: { pieces: CutterPiece[]; dose: number; physical: number; cutCost: number } | null = null;

  function cutCostOf(pieces: CutterPiece[]): number {
    let cost = 0;
    for (const p of pieces) {
      if (p.size === 'half') cost += p.count * 1;
      else if (p.size === 'quarter') cost += p.count * 2;
    }
    return cost;
  }

  function recurse(idx: number, remaining: number, acc: CutterPiece[], dose: number): void {
    const diff = Math.abs(dose - input.targetDose);
    const physical = acc.reduce((s, p) => s + p.count, 0);
    if (physical > 0) {
      const cutCost = cutCostOf(acc);
      if (
        !best ||
        diff < Math.abs(best.dose - input.targetDose) ||
        (diff === Math.abs(best.dose - input.targetDose) && physical < best.physical) ||
        (diff === Math.abs(best.dose - input.targetDose) && physical === best.physical && cutCost < best.cutCost)
      ) {
        best = { pieces: acc.map((p) => ({ ...p })), dose, physical, cutCost };
      }
    }
    if (idx >= buckets.length || remaining <= 0) return;
    const b = buckets[idx]!;
    const maxN = Math.min(remaining, Math.ceil((input.targetDose * 1.5) / b.doseUnit) + 1);
    for (let n = 0; n <= maxN; n++) {
      if (n > 0) {
        acc.push({
          strength: b.tablet.strength,
          size: b.size,
          count: n,
          contributionMg: n * b.doseUnit,
          label: b.tablet.label,
        });
      }
      recurse(idx + 1, remaining - n, acc, dose + n * b.doseUnit);
      if (n > 0) acc.pop();
    }
  }
  recurse(0, maxPieces, [], 0);
  return best;
}

function buildInstruction(pieces: CutterPiece[]): string {
  if (pieces.length === 0) return 'No splittable plan available.';
  const parts = pieces.map((p) => {
    const noun = p.count === 1 ? '' : '';
    void noun;
    if (p.size === 'whole') {
      return `${p.count} whole ${labelFor(p)}`;
    }
    if (p.size === 'half') {
      return p.count === 1
        ? `half of a ${labelFor(p)}`
        : `${p.count} halves of a ${labelFor(p)}`;
    }
    return p.count === 1
      ? `a quarter of a ${labelFor(p)}`
      : `${p.count} quarters of a ${labelFor(p)}`;
  });
  if (parts.length === 1) return `Take ${parts[0]}.`;
  if (parts.length === 2) return `Take ${parts[0]} plus ${parts[1]}.`;
  return `Take ${parts.slice(0, -1).join(', ')}, plus ${parts[parts.length - 1]}.`;
}

function labelFor(p: CutterPiece): string {
  return p.label ?? `${p.strength}mg tablet`;
}

function sortPieces(pieces: CutterPiece[]): CutterPiece[] {
  const sizeOrder: Record<PieceSize, number> = { whole: 0, half: 1, quarter: 2 };
  return [...pieces].sort((a, b) => {
    if (a.strength !== b.strength) return b.strength - a.strength;
    return sizeOrder[a.size] - sizeOrder[b.size];
  });
}

export function planPillSplit(input: PillCutterPlanInput): PillCutterPlan {
  if (input.targetDose <= 0) throw new Error('targetDose must be positive');
  if (input.tablets.length === 0) {
    return {
      targetDose: input.targetDose,
      achievedDose: 0,
      deviationRatio: 1,
      pieces: [],
      pieceCount: 0,
      feasible: false,
      warnings: [],
      instruction: 'No tablet options provided.',
    };
  }
  const maxDev = input.maxDeviationRatio ?? 0.05;
  const maxPieces = input.maxPiecesPerDose ?? 4;

  // 1) Compute the best combo using ONLY legitimate splits.
  const best = enumerateCombos(input, { allowAllSizes: false });
  const warnings: CutterWarning[] = [];

  // ER warnings always carry through (informational even if not used).
  for (const t of input.tablets) {
    if (t.extendedRelease) {
      warnings.push({
        kind: 'extended-release',
        strength: t.strength,
        note: `${labelOf(t)} is extended-release; not splittable.`,
      });
    }
  }

  if (!best) {
    return {
      targetDose: input.targetDose,
      achievedDose: 0,
      deviationRatio: 1,
      pieces: [],
      pieceCount: 0,
      feasible: false,
      warnings,
      instruction: 'No splittable plan available (all tablets are unsplittable).',
    };
  }

  // 2) Check whether the plan needs splits the tablet doesn't support
  //    (only triggered if enumerateCombos used a fallback path; with
  //    allowAllSizes=false this loop is mostly a guard).
  for (const piece of best.pieces) {
    const tablet = input.tablets.find((t) => t.strength === piece.strength);
    if (!tablet) continue;
    if (piece.size === 'half' && !tablet.scored) {
      warnings.push({
        kind: 'not-scored',
        strength: tablet.strength,
        note: `${labelOf(tablet)} is not scored; halving is unreliable.`,
      });
    }
    if (piece.size === 'quarter' && (!tablet.scored || !tablet.crossScored)) {
      warnings.push({
        kind: 'no-cross-score',
        strength: tablet.strength,
        note: `${labelOf(tablet)} lacks a cross score; quartering is unreliable.`,
      });
    }
  }

  // 3) Too-many-pieces cap (usability blocker).
  if (best.physical > maxPieces) {
    warnings.push({
      kind: 'too-many-pieces',
      strength: best.pieces[0]!.strength,
      note: `Plan requires ${best.physical} pieces; max is ${maxPieces}.`,
    });
  }

  // 4) Deviation cap.
  const dev = (best.dose - input.targetDose) / input.targetDose;
  const withinDeviation = Math.abs(dev) <= maxDev + 1e-9;

  // 5) Edge case: every option is unsplittable AND the best whole-only
  //    combo misses the target by more than maxDev.
  const allBlocked = input.tablets.every(
    (t) => t.extendedRelease || (!t.scored && t.strength !== input.targetDose),
  );
  if (allBlocked && !withinDeviation) {
    warnings.push({
      kind: 'unsplittable-only-option',
      strength: input.tablets[0]!.strength,
      note: 'No tablet can be split safely AND no whole-tablet combo matches the target.',
    });
  }

  const blocking = warnings.filter((w) => BLOCKING_KINDS.has(w.kind));
  // ER warnings on tablets the plan didn't use are NOT blocking.
  const blockingForUsedTablets = blocking.filter((w) => {
    if (w.kind === 'extended-release') {
      return best.pieces.some((p) => p.strength === w.strength);
    }
    return true;
  });

  const feasible = withinDeviation && blockingForUsedTablets.length === 0;
  const sorted = sortPieces(best.pieces);

  return {
    targetDose: input.targetDose,
    achievedDose: Number(best.dose.toFixed(6)),
    deviationRatio: Number(dev.toFixed(6)),
    pieces: sorted,
    pieceCount: best.physical,
    feasible,
    warnings,
    instruction: feasible
      ? buildInstruction(sorted)
      : `${buildInstruction(sorted)} Plan is not safe to follow as-is (${blockingForUsedTablets.length || (!withinDeviation ? 1 : 0)} blocking issue${(blockingForUsedTablets.length || 1) === 1 ? '' : 's'}).`,
  };
}
