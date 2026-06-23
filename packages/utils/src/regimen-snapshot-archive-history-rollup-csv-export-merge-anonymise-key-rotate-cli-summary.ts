/**
 * Regimen snapshot archive history rollup CSV export merge
 * anonymise key-rotate — CLI summary line.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate`
 * already exposes `summarizeAnonymiseKeyRotation` which returns a
 * single-line human sentence: "Anonymise key rotation: 14 patients
 * mapped (no collisions)." That sentence is suitable for a developer
 * console log. It is NOT suitable for the cron's structured CLI
 * pipeline:
 *
 *   - it doesn't carry the action taken (sequential reshuffle
 *     count) — the analytics partner must know how many patients
 *     had their pseudonyms change BEYOND a no-op rotation;
 *   - it doesn't carry the collision count or the unique-old
 *     pseudonym counts that the security audit asks for;
 *   - it doesn't carry the policy verdict ("safe to ship",
 *     "widen hashHexLength", "no rotation needed");
 *   - it isn't a fixed-shape line that grep / awk can parse from
 *     a stack of nightly log files.
 *
 * This module is the CLI-line companion. It returns a single
 * compact, machine-greppable summary line:
 *
 *   "[key-rotate] patients=14 reshuffled=5 collisions=0 verdict=ship-safe"
 *   "[key-rotate] patients=14 reshuffled=0 collisions=0 verdict=no-op"
 *   "[key-rotate] patients=14 reshuffled=0 collisions=2 verdict=widen-hash"
 *   "[key-rotate] patients=0 reshuffled=0 collisions=0 verdict=empty-cohort"
 *
 * The line is FIXED-SHAPE (always 5 fields, always in the same
 * order, all key=value) so an ops log scraper can parse it with a
 * single regex.
 *
 * Verdicts:
 *   - 'no-op' — `noOpRotation === true`. Every patient's pseudonym
 *     stayed identical across the rotation.
 *   - 'widen-hash' — `collisionDetected === true`. At least one
 *     pair of distinct patient ids collided under either secret.
 *     The caller MUST widen hashHexLength before shipping.
 *   - 'ship-safe' — no collision, at least one patient changed
 *     pseudonym across the rotation. Standard happy-path.
 *   - 'empty-cohort' — zero patients in the mapping. The rotation
 *     was a no-op by virtue of having nothing to rotate; surfaced
 *     as its own verdict so the cron knows the upstream cohort
 *     query returned empty.
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - RegimenHistoryAnonymiseKeyRotateResult shape from key-rotate
 *     (the upstream module that produces collision + noOp flags)
 */

import type { RegimenHistoryAnonymiseKeyRotateResult } from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

export type AnonymiseKeyRotateCliVerdict =
  | 'no-op'
  | 'widen-hash'
  | 'ship-safe'
  | 'empty-cohort';

export interface AnonymiseKeyRotateCliSummary {
  /** Total patients in the mapping. */
  patients: number;
  /**
   * Patients whose pseudonym changed across the rotation. Always 0
   * when noOpRotation === true.
   */
  reshuffled: number;
  /** True when any pair of distinct patient ids collided. */
  collisions: number;
  /** Fixed-shape verdict tag for the cron pipeline. */
  verdict: AnonymiseKeyRotateCliVerdict;
  /** Full one-line CLI summary string. */
  line: string;
}

export interface AnonymiseKeyRotateCliSummaryOptions {
  /**
   * Prefix tag. Default '[key-rotate]'. Set this when multiple
   * cohorts run in the same cron and the scraper needs to tell
   * them apart (e.g. '[key-rotate cohort=cardiology]').
   */
  tag?: string;
}

/**
 * Count rows whose old pseudonym changed across the rotation.
 *
 * Compares oldPseudonymousId vs newPseudonymousId AND
 * oldPseudonymousName vs newPseudonymousName. A row counts as
 * reshuffled if EITHER field changed (typically both change
 * together, but a stable id with reshuffled sequential name still
 * shifts the analytics-partner lookup so it counts).
 */
function countReshuffled(
  result: RegimenHistoryAnonymiseKeyRotateResult,
): number {
  let n = 0;
  for (const m of result.mappings) {
    if (
      m.oldPseudonymousId !== m.newPseudonymousId ||
      m.oldPseudonymousName !== m.newPseudonymousName
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Pick the verdict tag from the rotation result.
 *
 * Verdict precedence (most severe first):
 *   1. empty-cohort  — zero patients
 *   2. widen-hash    — at least one collision; ANY other state is
 *                      moot because the mapping is unsafe to ship
 *   3. no-op         — every pseudonym stayed identical
 *   4. ship-safe     — default happy-path
 */
function pickVerdict(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  reshuffled: number,
): AnonymiseKeyRotateCliVerdict {
  if (result.mappings.length === 0) return 'empty-cohort';
  if (result.collisionDetected) return 'widen-hash';
  if (result.noOpRotation || reshuffled === 0) return 'no-op';
  return 'ship-safe';
}

/**
 * Build the single CLI summary line for an anonymise key-rotation.
 *
 * The line is fixed-shape `<tag> patients=N reshuffled=N collisions=N verdict=V`
 * for grep / awk consumption.
 *
 * Pure / deterministic.
 */
export function summarizeAnonymiseKeyRotationForCli(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  options: AnonymiseKeyRotateCliSummaryOptions = {},
): AnonymiseKeyRotateCliSummary {
  const tag = options.tag ?? '[key-rotate]';
  const patients = result.mappings.length;
  const collisions = result.collisionDetected ? countCollisions(result) : 0;
  const reshuffled = result.noOpRotation ? 0 : countReshuffled(result);
  const verdict = pickVerdict(result, reshuffled);
  const line =
    `${tag} patients=${patients} reshuffled=${reshuffled} ` +
    `collisions=${collisions} verdict=${verdict}`;
  return { patients, reshuffled, collisions, verdict, line };
}

/**
 * Count colliding pairs in the rotation. A collision is two
 * DISTINCT input patient ids that hashed to the same pseudonym
 * under either the old or new secret.
 *
 * Returns the number of distinct (oldPseudonymousId, secretEpoch)
 * pairs that participate in a collision — i.e. if patients X and Y
 * both hash to 'pid-abcd' under the OLD secret, that contributes 1
 * collision; if they ALSO both hash to 'pid-1234' under the NEW
 * secret, that contributes a second collision.
 *
 * Total collisions = sum of distinct collision groups across both
 * epochs minus the unique pseudonyms (i.e. participants beyond the
 * first distinct member).
 */
function countCollisions(
  result: RegimenHistoryAnonymiseKeyRotateResult,
): number {
  let collisions = 0;
  // OLD epoch
  const oldGroups = new Map<string, number>();
  for (const m of result.mappings) {
    oldGroups.set(
      m.oldPseudonymousId,
      (oldGroups.get(m.oldPseudonymousId) ?? 0) + 1,
    );
  }
  for (const count of oldGroups.values()) {
    if (count > 1) collisions += count - 1;
  }
  // NEW epoch
  const newGroups = new Map<string, number>();
  for (const m of result.mappings) {
    newGroups.set(
      m.newPseudonymousId,
      (newGroups.get(m.newPseudonymousId) ?? 0) + 1,
    );
  }
  for (const count of newGroups.values()) {
    if (count > 1) collisions += count - 1;
  }
  return collisions;
}

/**
 * Detect the most actionable misconfiguration for a CLI summary.
 *
 * Returns a single string suitable for surfacing alongside the
 * structured line in a `[key-rotate-warn]` log entry. Null when
 * no actionable misconfiguration is detected.
 *
 *   - "widen hashHexLength: N colliding pseudonyms detected"
 *   - "no-op rotation: old and new secrets produce identical
 *      pseudonyms — verify rotation was actually applied"
 *   - "empty cohort: upstream cohort query returned zero patients"
 */
export function detectAnonymiseKeyRotateCliWarning(
  summary: AnonymiseKeyRotateCliSummary,
): string | null {
  if (summary.verdict === 'widen-hash') {
    return `widen hashHexLength: ${summary.collisions} colliding ${
      summary.collisions === 1 ? 'pseudonym' : 'pseudonyms'
    } detected`;
  }
  if (summary.verdict === 'no-op' && summary.patients > 0) {
    return 'no-op rotation: old and new secrets produce identical pseudonyms - verify rotation was actually applied';
  }
  if (summary.verdict === 'empty-cohort') {
    return 'empty cohort: upstream cohort query returned zero patients';
  }
  return null;
}

/**
 * Roll N rotation results into a single multi-cohort CLI line.
 *
 * For pipelines that run several rotations per cron tick (one per
 * analytics partner, one per region) and want a single rolled-up
 * line at the end summarising the entire run:
 *
 *   "[key-rotate-batch] cohorts=4 patients_total=42 reshuffled_total=12 collisions_total=0 verdict=ship-safe"
 *
 * Batch verdict precedence: any 'widen-hash' wins; else any
 * 'empty-cohort' wins; else any 'ship-safe' wins; else 'no-op'.
 */
export function summarizeAnonymiseKeyRotationBatchForCli(
  summaries: AnonymiseKeyRotateCliSummary[],
  options: AnonymiseKeyRotateCliSummaryOptions = {},
): {
  cohorts: number;
  patientsTotal: number;
  reshuffledTotal: number;
  collisionsTotal: number;
  verdict: AnonymiseKeyRotateCliVerdict;
  line: string;
} {
  const tag = options.tag ?? '[key-rotate-batch]';
  const cohorts = summaries.length;
  let patientsTotal = 0;
  let reshuffledTotal = 0;
  let collisionsTotal = 0;
  let hasWidenHash = false;
  let hasEmpty = false;
  let hasShipSafe = false;
  let hasNoOp = false;
  for (const s of summaries) {
    patientsTotal += s.patients;
    reshuffledTotal += s.reshuffled;
    collisionsTotal += s.collisions;
    if (s.verdict === 'widen-hash') hasWidenHash = true;
    else if (s.verdict === 'empty-cohort') hasEmpty = true;
    else if (s.verdict === 'ship-safe') hasShipSafe = true;
    else if (s.verdict === 'no-op') hasNoOp = true;
  }
  let verdict: AnonymiseKeyRotateCliVerdict;
  if (hasWidenHash) verdict = 'widen-hash';
  else if (cohorts === 0) verdict = 'empty-cohort';
  else if (hasShipSafe) verdict = 'ship-safe';
  else if (hasEmpty && !hasNoOp) verdict = 'empty-cohort';
  else verdict = 'no-op';
  const line =
    `${tag} cohorts=${cohorts} patients_total=${patientsTotal} ` +
    `reshuffled_total=${reshuffledTotal} collisions_total=${collisionsTotal} ` +
    `verdict=${verdict}`;
  return {
    cohorts,
    patientsTotal,
    reshuffledTotal,
    collisionsTotal,
    verdict,
    line,
  };
}
