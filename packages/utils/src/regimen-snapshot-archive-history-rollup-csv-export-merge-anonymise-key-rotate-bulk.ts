/**
 * Regimen snapshot archive history rollup — CSV export merge,
 * anonymisation key-rotation BULK companion.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate`
 * builds a single old -> new pseudonym mapping across ONE secret
 * rotation. A clinic that has been mailing the same analytics
 * partner for a long time accumulates a CHAIN of rotations:
 *
 *   epoch 0 (initial)  -> secret-2022
 *   epoch 1 (rotation) -> secret-2023
 *   epoch 2 (rotation) -> secret-2024
 *   epoch 3 (rotation) -> secret-2025
 *   epoch 4 (rotation) -> secret-2026  (current)
 *
 * After a few annual rotations the analytics partner has a stack of
 * per-epoch lookup tables, each connecting epoch_N -> epoch_N+1.
 * To answer "what is the patient currently known as pid-7a3f if I
 * have a row tagged pid-c1d2 from epoch 0?", the partner has to
 * walk the chain by hand:
 *
 *   pid-c1d2 (e0) -> pid-9b41 (e1) -> pid-2f80 (e2) -> ... -> pid-7a3f (e4)
 *
 * This module is the bulk-rotation companion. Given a chain of N+1
 * secrets (oldest first; current last) and the patient cohort, it
 * produces:
 *
 *   - a per-EPOCH-TRANSITION mapping (same shape as the single-step
 *     rotation, but tagged with fromEpoch / toEpoch);
 *   - a per-PATIENT chain mapping (one row per patient with the
 *     full pseudonym at each epoch, e.g. [pid-c1d2, pid-9b41,
 *     pid-2f80, pid-7a3f]);
 *   - a per-patient TERMINAL mapping (pseudonym at first epoch ->
 *     pseudonym at last epoch) for the typical "I have ancient
 *     data; what's the current pseudonym?" lookup;
 *   - a rotation summary (count of epochs, no-op rotations,
 *     collisions detected at any epoch).
 *
 * For clinics auditing a long secret-rotation history (security
 * audits regularly ask for "show me the rotation log for the
 * last 10 years"), this module lets the audit walk be done in
 * a single pass.
 *
 * Pure / deterministic given stable input secrets + patient list.
 * Uses the same Web Crypto HMAC pipeline as the single-rotation
 * companion; all functions are async.
 *
 * Composes:
 *   - buildAnonymiseKeyRotation (per-transition mappings)
 *   - the primary merge-anonymise's pseudonym strategy semantics
 */

import {
  buildAnonymiseKeyRotation,
  type RegimenHistoryAnonymiseKeyRotateEntry,
  type RegimenHistoryAnonymiseKeyRotateOptions,
  type RegimenHistoryAnonymiseKeyRotateResult,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

export interface RegimenHistoryAnonymiseKeyRotateBulkOptions
  extends Omit<RegimenHistoryAnonymiseKeyRotateOptions, 'oldSecret' | 'newSecret'> {
  /**
   * Ordered chain of HMAC secrets, oldest first. Must contain at
   * least TWO entries (one transition). Adjacent entries become
   * (old, new) pairs for buildAnonymiseKeyRotation. Each entry must
   * be a non-empty string; duplicates ARE allowed (a no-op rotation
   * is a valid epoch in the chain — e.g. the secret was rotated
   * to itself in a dry-run year).
   */
  secrets: string[];
  /**
   * Optional human labels for each epoch (parallel to secrets,
   * MUST be the same length OR undefined). Defaults to
   * ["epoch-0", "epoch-1", ...]. Used by summarizeKeyRotateBulk
   * and by the per-transition mappings' fromEpochLabel /
   * toEpochLabel fields.
   */
  epochLabels?: string[];
}

export interface RegimenHistoryAnonymiseKeyRotateBulkTransition {
  /** Source epoch index (0-based). */
  fromEpoch: number;
  /** Target epoch index (0-based). */
  toEpoch: number;
  /** Human label for the source epoch. */
  fromEpochLabel: string;
  /** Human label for the target epoch. */
  toEpochLabel: string;
  /** The underlying per-patient mapping at this transition. */
  result: RegimenHistoryAnonymiseKeyRotateResult;
}

export interface RegimenHistoryAnonymiseKeyRotateBulkPatientChain {
  /** Original patient id (input). */
  originalPatientId: string;
  /** Original patient name (input). */
  originalPatientName: string;
  /**
   * Per-epoch pseudonymous id, length === secrets.length. Index 0 is
   * the pseudonym under the oldest secret, last index is the current.
   */
  pseudonymousIdChain: string[];
  /**
   * Per-epoch pseudonymous name, length === secrets.length. Same
   * indexing as pseudonymousIdChain.
   */
  pseudonymousNameChain: string[];
}

export interface RegimenHistoryAnonymiseKeyRotateBulkTerminal {
  /** Original patient id (input). */
  originalPatientId: string;
  /** Original patient name (input). */
  originalPatientName: string;
  /** Pseudonym at the OLDEST epoch (first secret). */
  firstEpochPseudonymousId: string;
  /** Pseudonym at the OLDEST epoch (first secret). */
  firstEpochPseudonymousName: string;
  /** Pseudonym at the NEWEST epoch (last secret). */
  lastEpochPseudonymousId: string;
  /** Pseudonym at the NEWEST epoch (last secret). */
  lastEpochPseudonymousName: string;
}

export interface RegimenHistoryAnonymiseKeyRotateBulkResult {
  /**
   * Per-transition mappings, oldest -> newest order. Length ===
   * secrets.length - 1. Each entry is a single-step rotation
   * (epoch N -> epoch N+1).
   */
  transitions: RegimenHistoryAnonymiseKeyRotateBulkTransition[];
  /**
   * Per-patient pseudonym chain across every epoch.
   */
  patientChains: RegimenHistoryAnonymiseKeyRotateBulkPatientChain[];
  /**
   * Per-patient terminal mapping (oldest epoch -> newest epoch).
   * For the common "I have ancient data; what's the current
   * pseudonym?" lookup.
   */
  terminals: RegimenHistoryAnonymiseKeyRotateBulkTerminal[];
  /** Number of epochs (== secrets.length). */
  epochCount: number;
  /** Number of transitions (== secrets.length - 1). */
  transitionCount: number;
  /**
   * Number of transitions where every patient's old pseudonym
   * equalled the new pseudonym (no-op rotations).
   */
  noOpTransitionCount: number;
  /**
   * True if collision was detected in ANY epoch (under ANY secret).
   * Caller MUST widen hashHexLength if true.
   */
  collisionDetectedAtAnyEpoch: boolean;
  /**
   * Epoch labels mirrored into the result for cron-log / report
   * convenience.
   */
  epochLabels: string[];
}

interface InputPatient {
  patientId: string;
  patientName: string;
}

function dedupePatients(patients: InputPatient[]): InputPatient[] {
  const seen = new Set<string>();
  const out: InputPatient[] = [];
  for (const p of patients) {
    if (seen.has(p.patientId)) continue;
    seen.add(p.patientId);
    out.push(p);
  }
  return out;
}

function defaultEpochLabel(i: number): string {
  return `epoch-${i}`;
}

/**
 * Build the bulk-rotation across N+1 secret epochs.
 *
 * Walks the chain of secrets pairwise: for each adjacent (old, new)
 * pair, computes the single-step rotation, then assembles the
 * per-patient chain by stitching the per-transition mappings
 * together. The final terminal mapping is patient[i].chain[0] ->
 * patient[i].chain[N-1].
 *
 * Pure / deterministic.
 */
export async function buildAnonymiseKeyRotateBulk(
  patients: InputPatient[],
  options: RegimenHistoryAnonymiseKeyRotateBulkOptions,
): Promise<RegimenHistoryAnonymiseKeyRotateBulkResult> {
  if (!Array.isArray(options.secrets) || options.secrets.length < 2) {
    throw new Error(
      'secrets must be an array of at least 2 non-empty strings (one rotation requires 2 secrets).',
    );
  }
  for (let i = 0; i < options.secrets.length; i++) {
    const s = options.secrets[i];
    if (typeof s !== 'string' || s.length === 0) {
      throw new Error(
        `secrets[${i}] must be a non-empty string.`,
      );
    }
  }
  if (
    options.epochLabels !== undefined &&
    options.epochLabels.length !== options.secrets.length
  ) {
    throw new Error(
      'epochLabels.length must equal secrets.length when provided.',
    );
  }

  const unique = dedupePatients(patients);
  const epochCount = options.secrets.length;
  const transitionCount = epochCount - 1;
  const epochLabels = (options.epochLabels ?? options.secrets.map((_, i) => defaultEpochLabel(i)));

  // Build per-transition rotations in parallel.
  const transitionPromises: Promise<RegimenHistoryAnonymiseKeyRotateResult>[] = [];
  for (let i = 0; i < transitionCount; i++) {
    const oldSecret = options.secrets[i]!;
    const newSecret = options.secrets[i + 1]!;
    const subOptions: RegimenHistoryAnonymiseKeyRotateOptions = {
      oldSecret,
      newSecret,
    };
    if (options.hashHexLength !== undefined) subOptions.hashHexLength = options.hashHexLength;
    if (options.hashPrefix !== undefined) subOptions.hashPrefix = options.hashPrefix;
    if (options.nameStrategy !== undefined) subOptions.nameStrategy = options.nameStrategy;
    transitionPromises.push(buildAnonymiseKeyRotation(unique, subOptions));
  }
  const transitionResults = await Promise.all(transitionPromises);

  const transitions: RegimenHistoryAnonymiseKeyRotateBulkTransition[] = transitionResults.map(
    (result, i) => ({
      fromEpoch: i,
      toEpoch: i + 1,
      fromEpochLabel: epochLabels[i] ?? defaultEpochLabel(i),
      toEpochLabel: epochLabels[i + 1] ?? defaultEpochLabel(i + 1),
      result,
    }),
  );

  // Build per-patient chains by stitching transitions:
  //   epoch 0 = old in transition 0
  //   epoch i = new in transition i-1
  // Patient indexing is preserved across transitions because we pass
  // the same deduped patient array to every buildAnonymiseKeyRotation
  // call.
  const patientChains: RegimenHistoryAnonymiseKeyRotateBulkPatientChain[] = unique.map(
    (p, patientIdx) => {
      const pseudonymousIdChain: string[] = [];
      const pseudonymousNameChain: string[] = [];
      // Epoch 0: pull "old" from transition 0.
      if (transitions.length > 0) {
        const t0Entry: RegimenHistoryAnonymiseKeyRotateEntry | undefined =
          transitions[0]!.result.mappings[patientIdx];
        pseudonymousIdChain.push(t0Entry?.oldPseudonymousId ?? '');
        pseudonymousNameChain.push(t0Entry?.oldPseudonymousName ?? '');
      }
      // Epoch 1..N: pull "new" from transition i-1.
      for (let i = 1; i < epochCount; i++) {
        const tEntry: RegimenHistoryAnonymiseKeyRotateEntry | undefined =
          transitions[i - 1]!.result.mappings[patientIdx];
        pseudonymousIdChain.push(tEntry?.newPseudonymousId ?? '');
        pseudonymousNameChain.push(tEntry?.newPseudonymousName ?? '');
      }
      return {
        originalPatientId: p.patientId,
        originalPatientName: p.patientName,
        pseudonymousIdChain,
        pseudonymousNameChain,
      };
    },
  );

  const terminals: RegimenHistoryAnonymiseKeyRotateBulkTerminal[] = patientChains.map(
    (c) => ({
      originalPatientId: c.originalPatientId,
      originalPatientName: c.originalPatientName,
      firstEpochPseudonymousId: c.pseudonymousIdChain[0] ?? '',
      firstEpochPseudonymousName: c.pseudonymousNameChain[0] ?? '',
      lastEpochPseudonymousId:
        c.pseudonymousIdChain[c.pseudonymousIdChain.length - 1] ?? '',
      lastEpochPseudonymousName:
        c.pseudonymousNameChain[c.pseudonymousNameChain.length - 1] ?? '',
    }),
  );

  const noOpTransitionCount = transitions.filter((t) => t.result.noOpRotation).length;
  const collisionDetectedAtAnyEpoch = transitions.some(
    (t) => t.result.collisionDetected,
  );

  return {
    transitions,
    patientChains,
    terminals,
    epochCount,
    transitionCount,
    noOpTransitionCount,
    collisionDetectedAtAnyEpoch,
    epochLabels,
  };
}

/**
 * Convenience: produce a Map keyed on the FIRST-epoch pseudonymous id
 * with the LAST-epoch pseudonymous pair as the value. The most
 * common audit-time lookup ("I have ancient data; what's the current
 * pseudonym?").
 */
export function buildFirstToLastEpochPseudonymLookup(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
): Map<string, { lastEpochPseudonymousId: string; lastEpochPseudonymousName: string }> {
  const out = new Map<string, { lastEpochPseudonymousId: string; lastEpochPseudonymousName: string }>();
  for (const t of result.terminals) {
    if (t.firstEpochPseudonymousId.length === 0) continue;
    out.set(t.firstEpochPseudonymousId, {
      lastEpochPseudonymousId: t.lastEpochPseudonymousId,
      lastEpochPseudonymousName: t.lastEpochPseudonymousName,
    });
  }
  return out;
}

/**
 * Convenience: produce a Map keyed on the pseudonymous id at a
 * specific epoch (by index) with the pseudonym at a LATER epoch
 * as the value. For audits asking "given pid-c1d2 from epoch 2,
 * what is it at epoch 4?".
 *
 * Throws when fromEpoch >= toEpoch or either is out of bounds.
 */
export function buildEpochToEpochPseudonymLookup(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
  fromEpoch: number,
  toEpoch: number,
): Map<string, { pseudonymousId: string; pseudonymousName: string }> {
  if (
    !Number.isInteger(fromEpoch) ||
    !Number.isInteger(toEpoch) ||
    fromEpoch < 0 ||
    toEpoch < 0 ||
    fromEpoch >= result.epochCount ||
    toEpoch >= result.epochCount
  ) {
    throw new Error(
      `fromEpoch + toEpoch must be in [0, ${result.epochCount - 1}].`,
    );
  }
  if (fromEpoch >= toEpoch) {
    throw new Error('fromEpoch must be strictly less than toEpoch.');
  }
  const out = new Map<string, { pseudonymousId: string; pseudonymousName: string }>();
  for (const chain of result.patientChains) {
    const fromId = chain.pseudonymousIdChain[fromEpoch];
    const toId = chain.pseudonymousIdChain[toEpoch];
    const toName = chain.pseudonymousNameChain[toEpoch];
    if (
      typeof fromId !== 'string' ||
      typeof toId !== 'string' ||
      typeof toName !== 'string' ||
      fromId.length === 0
    ) {
      continue;
    }
    out.set(fromId, { pseudonymousId: toId, pseudonymousName: toName });
  }
  return out;
}

/**
 * Convenience: drop the original patient id + name from the terminal
 * mappings so the resulting structure carries ONLY first -> last
 * pseudonyms. Safe to ship to an external analytics partner without
 * re-exposing source identifiers.
 */
export function buildTerminalPseudonymMapWithoutOriginalIds(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
): Array<{
  firstEpochPseudonymousId: string;
  firstEpochPseudonymousName: string;
  lastEpochPseudonymousId: string;
  lastEpochPseudonymousName: string;
}> {
  return result.terminals.map((t) => ({
    firstEpochPseudonymousId: t.firstEpochPseudonymousId,
    firstEpochPseudonymousName: t.firstEpochPseudonymousName,
    lastEpochPseudonymousId: t.lastEpochPseudonymousId,
    lastEpochPseudonymousName: t.lastEpochPseudonymousName,
  }));
}

/**
 * Convenience: one-line summary for the cron log / audit log.
 *
 *   "Anonymise key rotate bulk: 5 epochs (4 transitions); 14 patients
 *    chained; 0 no-op rotations; no collisions."
 */
export function summarizeKeyRotateBulk(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
): string {
  const n = result.patientChains.length;
  const transitions = result.transitionCount;
  const noOps = result.noOpTransitionCount;
  const collisionPart = result.collisionDetectedAtAnyEpoch
    ? 'collision detected — widen hashHexLength'
    : 'no collisions';
  return (
    `Anonymise key rotate bulk: ${result.epochCount} epochs ` +
    `(${transitions} ${transitions === 1 ? 'transition' : 'transitions'}); ` +
    `${n} ${n === 1 ? 'patient' : 'patients'} chained; ` +
    `${noOps} no-op ${noOps === 1 ? 'rotation' : 'rotations'}; ` +
    `${collisionPart}.`
  );
}
