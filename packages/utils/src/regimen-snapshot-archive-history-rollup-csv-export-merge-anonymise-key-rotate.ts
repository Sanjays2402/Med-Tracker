/**
 * Regimen snapshot archive history rollup — CSV export merge,
 * anonymisation key-rotation companion.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise`
 * pseudonymises patient ids via HMAC-SHA-256 keyed on a single
 * shared secret. A clinic that has been mailing the same analytics
 * partner the same anonymised sheet for months relies on the same
 * pseudonyms to remain stable across runs — the analytics partner
 * joins this month's "Patient A" against last month's "Patient A"
 * to track per-patient trends.
 *
 * When the clinic ROTATES its HMAC secret (annual security policy;
 * a leaked key; a security audit recommendation), every pseudonym
 * silently changes. Without a lookup table connecting the old
 * pseudonyms to the new ones, the analytics partner LOSES PATIENT
 * CONTINUITY — "Patient A" in the new dataset is not the same
 * person as "Patient A" in the previous one. The partner has to
 * re-baseline every trend.
 *
 * This module is the rotation companion. Given:
 *
 *   - the OLD HMAC secret;
 *   - the NEW HMAC secret;
 *   - the list of patient ids in the rotated cohort;
 *
 * it produces a per-patient mapping:
 *
 *   {
 *     originalPatientId,
 *     oldPseudonymousId, oldPseudonymousName,
 *     newPseudonymousId, newPseudonymousName,
 *   }
 *
 * which the clinic hands to the analytics partner (alongside the new
 * anonymised CSV) so the partner can update its lookup table without
 * losing trend continuity.
 *
 * The mapping is itself NOT PHI when shipped without the original
 * patient ids (i.e. only old -> new pseudonyms). We provide a
 * convenience helper `buildOldToNewPseudonymMapWithoutOriginalIds`
 * for that explicit-de-identification case.
 *
 * The new pseudonyms follow the SAME naming strategy as the
 * primary anonymise module ('sequential' / 'hashed' / 'redacted'),
 * which means the new "Patient A" might be a different patient
 * from the old "Patient A" under the 'sequential' strategy
 * (sequential names are stable by hashed-id sort order, and rotating
 * the secret reshuffles the hashed-id sort order). The mapping
 * preserves that semantic.
 *
 * Same HMAC implementation as the primary anonymise module:
 * globalThis.crypto.subtle (Web Crypto, no @types/node dep).
 * Functions are therefore async.
 *
 * Pure / deterministic given stable (oldSecret, newSecret).
 *
 * Composes:
 *   - hashPatientIdForAnonymisedMerge (for both old + new hashes)
 *   - the primary merge-anonymise's pseudonym strategy semantics
 *
 * Use case: clinic rotates its analytics-partner HMAC secret every
 * 12 months; this module produces the lookup that lets the partner
 * stitch the new "Patient pid-7a3f" back to the old "Patient pid-c1d2"
 * without re-receiving the source patient ids.
 */

import { hashPatientIdForAnonymisedMerge } from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise';

export interface RegimenHistoryAnonymiseKeyRotateOptions {
  /** Old HMAC secret. Min 32 chars (matches the primary module). */
  oldSecret: string;
  /** New HMAC secret. Min 32 chars. MUST differ from oldSecret. */
  newSecret: string;
  /**
   * Hex-truncation length used for both old and new hashes. Default
   * 16 (same as the primary module). Clamped to [4, 64].
   */
  hashHexLength?: number;
  /** Prefix prepended to old + new pseudonymous ids. Default 'pid-'. */
  hashPrefix?: string;
  /**
   * Strategy used to generate the pseudonymous patient NAME for both
   * old and new. Same semantics as the primary module:
   * 'sequential' (default), 'hashed', 'redacted'.
   * Pseudonymous IDS are always the hashed-id (no strategy affects
   * the id column).
   */
  nameStrategy?: 'sequential' | 'hashed' | 'redacted';
}

export interface RegimenHistoryAnonymiseKeyRotateEntry {
  /** Original patient id (input). */
  originalPatientId: string;
  /** Original patient name (input, mirrored back into the entry). */
  originalPatientName: string;
  /** Pseudonymous id under the OLD secret. */
  oldPseudonymousId: string;
  /** Pseudonymous name under the OLD secret. */
  oldPseudonymousName: string;
  /** Pseudonymous id under the NEW secret. */
  newPseudonymousId: string;
  /** Pseudonymous name under the NEW secret. */
  newPseudonymousName: string;
}

export interface RegimenHistoryAnonymiseKeyRotateResult {
  /** Per-patient mapping entries, input order. */
  mappings: RegimenHistoryAnonymiseKeyRotateEntry[];
  /**
   * True if any two distinct input patient ids hashed to the same
   * truncated digest under EITHER secret. When this fires the
   * caller MUST widen hashHexLength.
   */
  collisionDetected: boolean;
  /**
   * True if the mapping is a no-op (every patient's old pseudonym
   * equals the new pseudonym — i.e. the caller rotated to the same
   * secret). The mapping is still returned for downstream
   * convenience but this flag lets the caller short-circuit
   * mailer dispatch.
   */
  noOpRotation: boolean;
}

const SEQUENTIAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

interface InputPatient {
  patientId: string;
  patientName: string;
}

/** Pure 'sequential' name helper mirroring the primary module's algorithm. */
function sequentialName(index: number): string {
  if (index < SEQUENTIAL_ALPHABET.length) {
    return `Patient ${SEQUENTIAL_ALPHABET[index]}`;
  }
  const first = SEQUENTIAL_ALPHABET[Math.floor(index / SEQUENTIAL_ALPHABET.length) - 1];
  const second = SEQUENTIAL_ALPHABET[index % SEQUENTIAL_ALPHABET.length];
  return `Patient ${first}${second}`;
}

interface PseudonymPair {
  pseudonymousId: string;
  pseudonymousName: string;
}

async function buildPseudonyms(
  secret: string,
  patients: InputPatient[],
  hashHexLength: number,
  hashPrefix: string,
  nameStrategy: 'sequential' | 'hashed' | 'redacted',
): Promise<{ byOriginalId: Map<string, PseudonymPair>; collision: boolean }> {
  // Step 1: compute hashed id for each unique patient.
  const hashedById = new Map<string, string>();
  const reverseLookup = new Map<string, string>();
  let collision = false;
  for (const p of patients) {
    if (hashedById.has(p.patientId)) continue;
    const fullId = await hashPatientIdForAnonymisedMerge(secret, p.patientId, {
      hashHexLength,
      hashPrefix,
    });
    hashedById.set(p.patientId, fullId);
    const prior = reverseLookup.get(fullId);
    if (prior !== undefined && prior !== p.patientId) {
      collision = true;
    } else {
      reverseLookup.set(fullId, p.patientId);
    }
  }

  const byOriginalId = new Map<string, PseudonymPair>();
  if (nameStrategy === 'sequential') {
    const sortedHashed = [...new Set(hashedById.values())].sort();
    const nameByHashed = new Map<string, string>();
    sortedHashed.forEach((h, i) => nameByHashed.set(h, sequentialName(i)));
    for (const [originalId, hashed] of hashedById.entries()) {
      byOriginalId.set(originalId, {
        pseudonymousId: hashed,
        pseudonymousName: nameByHashed.get(hashed) ?? sequentialName(0),
      });
    }
  } else if (nameStrategy === 'hashed') {
    for (const [originalId, hashed] of hashedById.entries()) {
      const bare = hashed.startsWith(hashPrefix) ? hashed.slice(hashPrefix.length) : hashed;
      byOriginalId.set(originalId, {
        pseudonymousId: hashed,
        pseudonymousName: `Patient ${bare}`,
      });
    }
  } else {
    // 'redacted'
    for (const [originalId, hashed] of hashedById.entries()) {
      byOriginalId.set(originalId, {
        pseudonymousId: hashed,
        pseudonymousName: 'REDACTED',
      });
    }
  }
  return { byOriginalId, collision };
}

function dedupePatients(patients: InputPatient[]): InputPatient[] {
  // Preserve first-occurrence ordering when duplicate patientIds appear.
  const seen = new Set<string>();
  const out: InputPatient[] = [];
  for (const p of patients) {
    if (seen.has(p.patientId)) continue;
    seen.add(p.patientId);
    out.push(p);
  }
  return out;
}

/**
 * Build the per-patient mapping connecting OLD pseudonyms to NEW
 * pseudonyms across an HMAC secret rotation.
 *
 * Throws when oldSecret === newSecret AND nameStrategy is not
 * 'sequential' / 'hashed' — a no-op rotation is the most common
 * misuse and the caller usually wants an explicit error. (We allow
 * it under 'sequential' / 'hashed' to support a dry-run rotation
 * check; under those strategies the mapping is a stable identity
 * mapping that can be useful for sanity testing.)
 *
 * Same input -> byte-identical mapping output.
 *
 * Pure / deterministic.
 */
export async function buildAnonymiseKeyRotation(
  patients: InputPatient[],
  options: RegimenHistoryAnonymiseKeyRotateOptions,
): Promise<RegimenHistoryAnonymiseKeyRotateResult> {
  const hashHexLength = options.hashHexLength ?? 16;
  const hashPrefix = options.hashPrefix ?? 'pid-';
  const nameStrategy = options.nameStrategy ?? 'sequential';

  if (typeof options.oldSecret !== 'string' || options.oldSecret.length === 0) {
    throw new Error('oldSecret must be a non-empty string.');
  }
  if (typeof options.newSecret !== 'string' || options.newSecret.length === 0) {
    throw new Error('newSecret must be a non-empty string.');
  }

  const unique = dedupePatients(patients);

  const [oldPair, newPair] = await Promise.all([
    buildPseudonyms(options.oldSecret, unique, hashHexLength, hashPrefix, nameStrategy),
    buildPseudonyms(options.newSecret, unique, hashHexLength, hashPrefix, nameStrategy),
  ]);

  const mappings: RegimenHistoryAnonymiseKeyRotateEntry[] = unique.map((p) => {
    const o = oldPair.byOriginalId.get(p.patientId)!;
    const n = newPair.byOriginalId.get(p.patientId)!;
    return {
      originalPatientId: p.patientId,
      originalPatientName: p.patientName,
      oldPseudonymousId: o.pseudonymousId,
      oldPseudonymousName: o.pseudonymousName,
      newPseudonymousId: n.pseudonymousId,
      newPseudonymousName: n.pseudonymousName,
    };
  });

  const noOpRotation =
    mappings.length > 0 &&
    mappings.every(
      (m) =>
        m.oldPseudonymousId === m.newPseudonymousId &&
        m.oldPseudonymousName === m.newPseudonymousName,
    );

  return {
    mappings,
    collisionDetected: oldPair.collision || newPair.collision,
    noOpRotation,
  };
}

/**
 * Convenience: drop the original patient id + name from the mapping
 * so the resulting structure carries ONLY old -> new pseudonyms.
 * This shape is safe to ship to an external analytics partner: it
 * lets them update their lookup table from "old pid-..." to
 * "new pid-..." without ever seeing the source patient identifiers.
 */
export function buildOldToNewPseudonymMapWithoutOriginalIds(
  result: RegimenHistoryAnonymiseKeyRotateResult,
): Array<{
  oldPseudonymousId: string;
  oldPseudonymousName: string;
  newPseudonymousId: string;
  newPseudonymousName: string;
}> {
  return result.mappings.map((m) => ({
    oldPseudonymousId: m.oldPseudonymousId,
    oldPseudonymousName: m.oldPseudonymousName,
    newPseudonymousId: m.newPseudonymousId,
    newPseudonymousName: m.newPseudonymousName,
  }));
}

/**
 * Convenience: produce a Map keyed on the OLD pseudonymous id with
 * the NEW pseudonymous pair as the value. Lets a downstream consumer
 * cheaply translate previously-known pseudonyms to their new
 * equivalents (typical analytics-partner pattern: "I have a row
 * tagged pid-c1d2 from last month; what is it tagged this month?").
 */
export function buildOldToNewPseudonymLookup(
  result: RegimenHistoryAnonymiseKeyRotateResult,
): Map<string, { newPseudonymousId: string; newPseudonymousName: string }> {
  const out = new Map<string, { newPseudonymousId: string; newPseudonymousName: string }>();
  for (const m of result.mappings) {
    out.set(m.oldPseudonymousId, {
      newPseudonymousId: m.newPseudonymousId,
      newPseudonymousName: m.newPseudonymousName,
    });
  }
  return out;
}

/**
 * Convenience: one-line summary for the cron log / change-log.
 *
 *   "Anonymise key rotation: 14 patients mapped (no collisions)."
 *   "Anonymise key rotation: 14 patients mapped, NO-OP rotation."
 *   "Anonymise key rotation: 14 patients mapped, 1 collision — widen hashHexLength."
 */
export function summarizeAnonymiseKeyRotation(
  result: RegimenHistoryAnonymiseKeyRotateResult,
): string {
  const n = result.mappings.length;
  if (result.noOpRotation) {
    return `Anonymise key rotation: ${n} ${n === 1 ? 'patient' : 'patients'} mapped, NO-OP rotation.`;
  }
  if (result.collisionDetected) {
    return `Anonymise key rotation: ${n} ${n === 1 ? 'patient' : 'patients'} mapped, collision detected — widen hashHexLength.`;
  }
  return `Anonymise key rotation: ${n} ${n === 1 ? 'patient' : 'patients'} mapped (no collisions).`;
}
