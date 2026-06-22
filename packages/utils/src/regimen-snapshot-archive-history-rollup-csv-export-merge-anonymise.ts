/**
 * Regimen snapshot archive history rollup — CSV export merge,
 * anonymisation companion.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge` produces
 * a multi-patient sheet with two leading columns (patientId,
 * patientName) so a cardiologist seeing siblings on the same day
 * can scroll one CSV. The same sheet is increasingly valuable to
 * non-clinical recipients:
 *
 *   - a population-health analytics tool the practice subscribes to;
 *   - a research collaborator validating a de-prescribing protocol;
 *   - an internal QA dashboard the engineering team scrolls.
 *
 * None of those recipients should see the patient's real name or
 * stable patient id. This module is the anonymisation layer that
 * sits BETWEEN the per-patient export and the merge so the resulting
 * CSV is shippable to a third party without exposing PHI:
 *
 *   1. Hash patient ids with a stable secret (HMAC-SHA-256, truncated
 *      to a configurable byte length, hex-encoded). The same input
 *      with the same secret always yields the same output so the
 *      same patient appears under the same pseudonym across runs.
 *   2. Replace patient names with deterministic pseudonyms (e.g.
 *      "Patient A", "Patient B" — assigned by hashed-id order so the
 *      sibling who hashes earliest is always "Patient A").
 *   3. Pass the now-anonymised slices through the existing merge
 *      module. The combined CSV's first two columns are the
 *      pseudonymous id + pseudonymous name; every downstream row is
 *      otherwise byte-identical to the non-anonymised merge.
 *
 * Crucially, this module does NOT touch medication names, dose
 * strengths, snapshot ids, or takenAt timestamps. Those columns are
 * NOT PHI under HIPAA's safe-harbor de-identification (45 CFR
 * 164.514) when they're stripped of patient identifiers, dates more
 * granular than year, and the 18 HIPAA identifiers. Callers who
 * need stricter de-identification (e.g. year-only takenAt, strength-
 * only-as-tier) should layer additional transforms on top.
 *
 * The HMAC implementation uses `globalThis.crypto.subtle` (Web
 * Crypto, runs in Node 18+ and the browser, no @types/node
 * dependency). Same pattern as caregiver-share-token and
 * regimen-snapshot-archive in this package — these functions are
 * therefore ASYNC.
 *
 * Pure / deterministic given a stable hmacSecret.
 *
 * Use case: family-history pediatric appointment sibling comparison
 * (#146) shared with a population-health analytics tool — same
 * spreadsheet, no PHI, no per-patient re-export round-trip.
 */

import type {
  RegimenHistoryCsvMergeInput,
  RegimenHistoryCsvMergeOptions,
  RegimenHistoryCsvMergeResult,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge';
import { mergeRegimenHistoryRollupCsvExports } from './regimen-snapshot-archive-history-rollup-csv-export-merge';

export interface RegimenHistoryCsvMergeAnonymiseOptions
  extends RegimenHistoryCsvMergeOptions {
  /**
   * HMAC secret used to hash patient ids. MUST be at least 32 chars
   * in production. Tests may pass a longer string for clarity but
   * we enforce a minimum length to catch trivial misuse.
   */
  hmacSecret: string;
  /**
   * Number of hex chars to keep from the HMAC output. Default 16
   * (8 bytes of entropy). Longer hashes lower collision risk at
   * the cost of wider CSV cells. Clamped to [4, 64].
   */
  hashHexLength?: number;
  /**
   * Prefix prepended to every hashed id so the cell is human-
   * recognisable as a pseudonym. Default 'pid-'.
   */
  hashPrefix?: string;
  /**
   * Strategy used to generate the pseudonymous patient name.
   * - 'sequential' (default): "Patient A", "Patient B", ... assigned
   *   in HASHED-ID-SORTED order so the assignment is deterministic
   *   regardless of input array order.
   * - 'hashed': use the hashed id with a "Patient " prefix
   *   ("Patient 7a3f1b2c"). Stable across runs even when the input
   *   array order changes.
   * - 'redacted': literal "REDACTED" for every row — for the most
   *   conservative downstream consumers.
   */
  nameStrategy?: 'sequential' | 'hashed' | 'redacted';
}

export interface RegimenHistoryCsvMergeAnonymiseMapping {
  /** Original patient id (input). */
  originalPatientId: string;
  /** Original patient name (input). */
  originalPatientName: string;
  /** Pseudonymous id placed in the merged CSV. */
  anonymisedPatientId: string;
  /** Pseudonymous name placed in the merged CSV. */
  anonymisedPatientName: string;
}

export interface RegimenHistoryCsvMergeAnonymiseResult {
  /** Merged CSVs with anonymised patient columns. */
  merge: RegimenHistoryCsvMergeResult;
  /**
   * Per-input mapping so the caller can hand a key to authorised
   * recipients (e.g. the cardiologist gets the mapping; the
   * analytics tool does not).
   */
  mappings: RegimenHistoryCsvMergeAnonymiseMapping[];
  /**
   * True if any two distinct input patient ids hashed to the same
   * truncated digest. When this fires the caller MUST widen
   * hashHexLength or rotate the secret — two patients sharing a
   * pseudonym is a data-integrity bug.
   */
  collisionDetected: boolean;
}

const MIN_SECRET_LENGTH = 32;
const SEQUENTIAL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('hmacSecret must be a non-empty string.');
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `hmacSecret must be at least ${MIN_SECRET_LENGTH} chars; got ${secret.length}.`,
    );
  }
}

function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function asBufferSource(b: Uint8Array): ArrayBuffer {
  const fresh = new ArrayBuffer(b.byteLength);
  new Uint8Array(fresh).set(b);
  return fresh;
}

function bytesToHex(bytes: Uint8Array): string {
  const out: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i]!.toString(16).padStart(2, '0');
  }
  return out.join('');
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    asBufferSource(stringToBytes(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hashPatientId(
  key: CryptoKey,
  patientId: string,
  hashHexLength: number,
): Promise<string> {
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    asBufferSource(stringToBytes(patientId)),
  );
  const hex = bytesToHex(new Uint8Array(sig));
  // SHA-256 hex is 64 chars; clamp the requested length into a
  // sensible range to avoid an empty or oversized cell.
  const clamped = Math.max(4, Math.min(64, hashHexLength));
  return hex.slice(0, clamped);
}

function sequentialName(index: number): string {
  // Single-letter for 0-25; AA, AB, ... for 26+. We don't need to
  // support a million patients, but a 30-patient family panel
  // shouldn't run out of letters.
  if (index < SEQUENTIAL_ALPHABET.length) {
    return `Patient ${SEQUENTIAL_ALPHABET[index]}`;
  }
  const first = SEQUENTIAL_ALPHABET[Math.floor(index / SEQUENTIAL_ALPHABET.length) - 1];
  const second = SEQUENTIAL_ALPHABET[index % SEQUENTIAL_ALPHABET.length];
  return `Patient ${first}${second}`;
}

interface PseudonymPair {
  anonymisedPatientId: string;
  anonymisedPatientName: string;
}

interface Pseudonyms {
  pairs: Map<string, PseudonymPair>;
  collisionDetected: boolean;
}

async function buildPseudonyms(
  slices: RegimenHistoryCsvMergeInput[],
  options: Required<
    Pick<RegimenHistoryCsvMergeAnonymiseOptions, 'hmacSecret' | 'hashHexLength' | 'hashPrefix' | 'nameStrategy'>
  >,
): Promise<Pseudonyms> {
  const key = await importHmacKey(options.hmacSecret);
  // Step 1: compute the hashed id for every unique input slice.
  const hashedById = new Map<string, string>();
  const reverseLookup = new Map<string, string>(); // hashed -> first originalId
  let collisionDetected = false;
  for (const slice of slices) {
    if (hashedById.has(slice.patientId)) continue; // duplicate slice id
    const hashed = await hashPatientId(key, slice.patientId, options.hashHexLength);
    hashedById.set(slice.patientId, hashed);
    const existing = reverseLookup.get(hashed);
    if (existing !== undefined && existing !== slice.patientId) {
      collisionDetected = true;
    } else {
      reverseLookup.set(hashed, slice.patientId);
    }
  }

  // Step 2: build the per-patient pseudonym pair. Sequential names
  // assign by hashed-id sorted order so the pseudonym is stable
  // across input-array reorderings.
  const pairs = new Map<string, PseudonymPair>();

  if (options.nameStrategy === 'sequential') {
    const sortedHashes = [...new Set(hashedById.values())].sort();
    const nameByHash = new Map<string, string>();
    sortedHashes.forEach((h, i) => nameByHash.set(h, sequentialName(i)));
    for (const [originalId, hashed] of hashedById.entries()) {
      pairs.set(originalId, {
        anonymisedPatientId: options.hashPrefix + hashed,
        anonymisedPatientName: nameByHash.get(hashed) ?? sequentialName(0),
      });
    }
  } else if (options.nameStrategy === 'hashed') {
    for (const [originalId, hashed] of hashedById.entries()) {
      pairs.set(originalId, {
        anonymisedPatientId: options.hashPrefix + hashed,
        anonymisedPatientName: `Patient ${hashed}`,
      });
    }
  } else {
    // 'redacted'
    for (const [originalId, hashed] of hashedById.entries()) {
      pairs.set(originalId, {
        anonymisedPatientId: options.hashPrefix + hashed,
        anonymisedPatientName: 'REDACTED',
      });
    }
  }

  return { pairs, collisionDetected };
}

/**
 * Anonymise the patient columns then merge.
 *
 * Returns the merged CSV with pseudonymous patient columns plus a
 * per-patient mapping the caller can hand to authorised recipients.
 * The merge body (medication / event columns) is byte-identical to
 * what mergeRegimenHistoryRollupCsvExports would produce for the
 * same input, except the patientId and patientName columns are
 * pseudonymised.
 *
 * Deterministic given a stable hmacSecret.
 */
export async function mergeRegimenHistoryRollupCsvExportsAnonymised(
  slices: RegimenHistoryCsvMergeInput[],
  options: RegimenHistoryCsvMergeAnonymiseOptions,
): Promise<RegimenHistoryCsvMergeAnonymiseResult> {
  assertSecret(options.hmacSecret);

  const required = {
    hmacSecret: options.hmacSecret,
    hashHexLength: options.hashHexLength ?? 16,
    hashPrefix: options.hashPrefix ?? 'pid-',
    nameStrategy: options.nameStrategy ?? ('sequential' as const),
  };

  const { pairs, collisionDetected } = await buildPseudonyms(slices, required);

  const anonymisedSlices: RegimenHistoryCsvMergeInput[] = slices.map((slice) => {
    const pair = pairs.get(slice.patientId);
    if (pair === undefined) {
      // Should not happen — buildPseudonyms walked the same slice list.
      throw new Error(
        `Internal: no pseudonym pair for patient ${slice.patientId}.`,
      );
    }
    return {
      patientId: pair.anonymisedPatientId,
      patientName: pair.anonymisedPatientName,
      export: slice.export,
      rollup: slice.rollup,
    };
  });

  const mergeOptions: RegimenHistoryCsvMergeOptions = {
    includeBom: options.includeBom,
    perPatientExportOptions: options.perPatientExportOptions,
  };

  const merge = mergeRegimenHistoryRollupCsvExports(anonymisedSlices, mergeOptions);

  const mappings: RegimenHistoryCsvMergeAnonymiseMapping[] = slices.map((slice) => {
    const pair = pairs.get(slice.patientId)!;
    return {
      originalPatientId: slice.patientId,
      originalPatientName: slice.patientName,
      anonymisedPatientId: pair.anonymisedPatientId,
      anonymisedPatientName: pair.anonymisedPatientName,
    };
  });

  return { merge, mappings, collisionDetected };
}

/**
 * Convenience: anonymise but return only the merged CSVs (drops the
 * mapping). For pipelines that ship the CSV to the analytics tool
 * directly and store the mapping out-of-band via a separate call.
 */
export async function mergeRegimenHistoryRollupCsvExportsAnonymisedCsvOnly(
  slices: RegimenHistoryCsvMergeInput[],
  options: RegimenHistoryCsvMergeAnonymiseOptions,
): Promise<RegimenHistoryCsvMergeResult> {
  return (await mergeRegimenHistoryRollupCsvExportsAnonymised(slices, options)).merge;
}

/**
 * Convenience: hash a single patient id with the same algorithm
 * (without going through the merge). Useful when the caller wants
 * to compute the pseudonym for a patient that isn't part of any
 * particular merge call — e.g. building a per-patient lookup table
 * up front.
 */
export async function hashPatientIdForAnonymisedMerge(
  secret: string,
  patientId: string,
  options: { hashHexLength?: number; hashPrefix?: string } = {},
): Promise<string> {
  assertSecret(secret);
  const hashHexLength = options.hashHexLength ?? 16;
  const hashPrefix = options.hashPrefix ?? 'pid-';
  const key = await importHmacKey(secret);
  const hashed = await hashPatientId(key, patientId, hashHexLength);
  return hashPrefix + hashed;
}
