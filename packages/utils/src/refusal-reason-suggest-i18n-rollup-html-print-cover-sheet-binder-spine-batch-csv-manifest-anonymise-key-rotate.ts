/**
 * Refusal reason suggest i18n rollup HTML print cover sheet binder
 * spine BATCH CSV MANIFEST ANONYMISE — KEY-ROTATE variant.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise`
 * hashes patient names BEFORE the spine manifest CSV is built so a
 * third-party sticker-paper printer doesn't see PHI. The hash is
 * keyed on a single HMAC secret. A clinic that has been mailing the
 * same printer the same anonymised manifest for months relies on
 * those pseudonyms to remain stable: the printer's print-error
 * reversal lookup table uses the stable pseudonym as its primary
 * key.
 *
 * When the clinic ROTATES its HMAC secret (annual security policy;
 * a leaked key; a security-audit recommendation), every pseudonym
 * silently changes. Without a lookup table connecting the old
 * pseudonyms to the new ones, the third-party printer's reversal
 * pipeline LOSES PATIENT CONTINUITY — "spine-7a3f1b2c" in the new
 * manifest is not the same patient as "spine-7a3f1b2c" in the
 * previous run.
 *
 * This module is the spine-manifest rotation companion (parallel to
 * the regimen-snapshot anonymise-key-rotate module). Given:
 *
 *   - the OLD HMAC secret;
 *   - the NEW HMAC secret;
 *   - the spine batch entries;
 *
 * it produces:
 *
 *   - `oldManifestCsv` — anonymised manifest under the OLD secret
 *     (what the printer received last time);
 *   - `newManifestCsv` — anonymised manifest under the NEW secret
 *     (what the printer receives this time);
 *   - `rotationLookupCsv` — per-patient mapping
 *     {oldPseudonymousName, newPseudonymousName} that the printer
 *     uses to update its lookup table without losing continuity;
 *   - the structured rotation entries for downstream typed
 *     consumers.
 *
 * The `oldManifestCsv` is ONLY meaningful when the rotation actually
 * happened: when oldSecret === newSecret it's a no-op (every old
 * pseudonym equals the new pseudonym) and the caller can short-
 * circuit shipping the rotation lookup.
 *
 * Collision semantics: if any two patient names collide under
 * EITHER secret, collisionDetected fires and the caller MUST widen
 * hashHexLength before shipping.
 *
 * Same HMAC implementation as the underlying anonymise module:
 * globalThis.crypto.subtle (Web Crypto, no @types/node dep).
 * Functions are therefore async.
 *
 * Pure / deterministic given stable (oldSecret, newSecret).
 *
 * Composes:
 *   - exportSpineBatchCsvManifestAnonymise (runs twice: once per
 *     secret)
 *   - SpineBatchCsvManifestAnonymiseOptions (shared option shape)
 */

import type {
  SpineBatchCsvManifestAnonymiseOptions,
  SpineBatchCsvManifestAnonymiseResult,
  SpineBatchCsvManifestAnonymiseNameStrategy,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise';
import { exportSpineBatchCsvManifestAnonymise } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise';
import type { RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';

export interface SpineBatchCsvManifestAnonymiseKeyRotateOptions
  extends Omit<SpineBatchCsvManifestAnonymiseOptions, 'hmacSecret'> {
  /** Old HMAC secret. Min 32 chars (enforced by the underlying module). */
  oldSecret: string;
  /**
   * New HMAC secret. Min 32 chars. MAY equal oldSecret (the result
   * will flag noOpRotation=true; the caller can short-circuit).
   */
  newSecret: string;
}

export interface SpineBatchCsvManifestAnonymiseKeyRotateEntry {
  /** Original patient name (in-house only — PHI). */
  originalPatientName: string;
  /** Pseudonymous name under the OLD secret. */
  oldPseudonymousName: string;
  /** Pseudonymous name under the NEW secret. */
  newPseudonymousName: string;
}

export interface SpineBatchCsvManifestAnonymiseKeyRotateResult {
  /** Anonymised manifest CSV under the OLD secret (third-party-safe). */
  oldManifestCsv: string;
  /** Anonymised manifest CSV under the NEW secret (third-party-safe). */
  newManifestCsv: string;
  /**
   * Per-patient old-to-new pseudonym mapping CSV (3 columns:
   * originalPatientName, oldPseudonymousName, newPseudonymousName)
   * for the in-house auditor's reversal lookup.
   *
   * WARNING: contains originalPatientName — keep INSIDE the BAA
   * boundary.
   */
  rotationLookupCsv: string;
  /**
   * Per-patient old-to-new pseudonym mapping CSV WITHOUT the
   * originalPatientName column (only 2 columns: oldPseudonymousName,
   * newPseudonymousName). Safe to share with the third-party
   * printer so they can update their lookup table without seeing
   * source PHI.
   */
  rotationLookupCsvWithoutOriginalNames: string;
  /** Structured per-patient mapping entries. */
  rotationEntries: SpineBatchCsvManifestAnonymiseKeyRotateEntry[];
  /** Underlying old-secret anonymise result (in-house only). */
  oldAnonymise: SpineBatchCsvManifestAnonymiseResult;
  /** Underlying new-secret anonymise result (in-house only). */
  newAnonymise: SpineBatchCsvManifestAnonymiseResult;
  /**
   * True when every old pseudonym equals the new pseudonym (caller
   * supplied oldSecret === newSecret, OR the strategy is 'redacted'
   * which maps every name to literal "REDACTED" regardless of
   * secret).
   */
  noOpRotation: boolean;
  /**
   * True when ANY collision was detected under EITHER secret. Caller
   * MUST widen hashHexLength before shipping.
   */
  collisionDetected: boolean;
  /** Resolved name strategy (mirrors options.nameStrategy ?? 'hashed'). */
  nameStrategy: SpineBatchCsvManifestAnonymiseNameStrategy;
}

const BOM = '\uFEFF';
const ROTATION_LOOKUP_HEADER_WITH_ORIGINAL = [
  'originalPatientName',
  'oldPseudonymousName',
  'newPseudonymousName',
];
const ROTATION_LOOKUP_HEADER_WITHOUT_ORIGINAL = [
  'oldPseudonymousName',
  'newPseudonymousName',
];

function escapeCsvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = value;
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinRow(values: (string | null | undefined)[]): string {
  return values.map(escapeCsvCell).join(',');
}

/**
 * Build the spine manifest under both the old and new HMAC secrets
 * and surface a per-patient rotation lookup so a clinic switching
 * secrets can update its third-party printer's lookup table without
 * losing patient continuity.
 *
 * Composes exportSpineBatchCsvManifestAnonymise twice (once per
 * secret) and walks the resulting lookup tables to produce the
 * rotation mapping.
 *
 * Pure / deterministic given stable (oldSecret, newSecret).
 */
export async function exportSpineBatchCsvManifestAnonymiseKeyRotate(
  entries: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[],
  options: SpineBatchCsvManifestAnonymiseKeyRotateOptions,
): Promise<SpineBatchCsvManifestAnonymiseKeyRotateResult> {
  if (typeof options.oldSecret !== 'string' || options.oldSecret.length < 32) {
    throw new Error(
      'oldSecret must be a string of at least 32 chars to avoid trivial misuse.',
    );
  }
  if (typeof options.newSecret !== 'string' || options.newSecret.length < 32) {
    throw new Error(
      'newSecret must be a string of at least 32 chars to avoid trivial misuse.',
    );
  }
  const nameStrategy = options.nameStrategy ?? 'hashed';
  const includeBom = options.includeBom ?? false;

  // Build the manifest under both secrets. We use the SAME options for
  // both runs (hashHexLength, hashPrefix, nameStrategy, preserveDateLabel
  // etc) — only the secret differs.
  const oldAnonymise = await exportSpineBatchCsvManifestAnonymise(entries, {
    ...options,
    hmacSecret: options.oldSecret,
  });
  const newAnonymise = await exportSpineBatchCsvManifestAnonymise(entries, {
    ...options,
    hmacSecret: options.newSecret,
  });

  // The two lookupRows arrays are sorted by originalPatientName ASC
  // (the underlying module guarantees this). For each distinct source
  // name we pair its oldPseudonymousName with its newPseudonymousName.
  const oldLookup = new Map<string, string>();
  for (const row of oldAnonymise.lookupRows) {
    oldLookup.set(row.originalPatientName, row.pseudonymousPatientName);
  }
  const newLookup = new Map<string, string>();
  for (const row of newAnonymise.lookupRows) {
    newLookup.set(row.originalPatientName, row.pseudonymousPatientName);
  }

  // Distinct source names are the same across both runs (same entries,
  // same set). Walk the OLD lookup so the resulting mapping order
  // matches the OLD anonymise's row order (alphabetical by source name).
  const rotationEntries: SpineBatchCsvManifestAnonymiseKeyRotateEntry[] = [];
  for (const [originalPatientName, oldPseudonymousName] of oldLookup) {
    const newPseudonymousName = newLookup.get(originalPatientName) ?? 'REDACTED';
    rotationEntries.push({
      originalPatientName,
      oldPseudonymousName,
      newPseudonymousName,
    });
  }

  // No-op rotation: every old pseudonym equals the new pseudonym.
  // Includes the redacted strategy (both map to literal "REDACTED").
  const noOpRotation = rotationEntries.every(
    (e) => e.oldPseudonymousName === e.newPseudonymousName,
  );
  const collisionDetected =
    oldAnonymise.collisionDetected || newAnonymise.collisionDetected;

  // Build the rotation lookup CSVs (with + without original name
  // column).
  const withOriginalBody = rotationEntries.map((e) =>
    joinRow([
      e.originalPatientName,
      e.oldPseudonymousName,
      e.newPseudonymousName,
    ]),
  );
  const withoutOriginalBody = rotationEntries.map((e) =>
    joinRow([e.oldPseudonymousName, e.newPseudonymousName]),
  );

  const rotationLookupCsv =
    (includeBom ? BOM : '') +
    [
      ROTATION_LOOKUP_HEADER_WITH_ORIGINAL.join(','),
      ...withOriginalBody,
    ].join('\n');
  const rotationLookupCsvWithoutOriginalNames =
    (includeBom ? BOM : '') +
    [
      ROTATION_LOOKUP_HEADER_WITHOUT_ORIGINAL.join(','),
      ...withoutOriginalBody,
    ].join('\n');

  return {
    oldManifestCsv: oldAnonymise.manifestCsv,
    newManifestCsv: newAnonymise.manifestCsv,
    rotationLookupCsv,
    rotationLookupCsvWithoutOriginalNames,
    rotationEntries,
    oldAnonymise,
    newAnonymise,
    noOpRotation,
    collisionDetected,
    nameStrategy,
  };
}

/**
 * Convenience: count rotation entries whose pseudonym actually
 * changed. Always 0 when noOpRotation === true.
 */
export function countSpineBatchCsvManifestAnonymiseKeyRotateChanges(
  result: SpineBatchCsvManifestAnonymiseKeyRotateResult,
): number {
  if (result.noOpRotation) return 0;
  let n = 0;
  for (const e of result.rotationEntries) {
    if (e.oldPseudonymousName !== e.newPseudonymousName) n++;
  }
  return n;
}

/**
 * Convenience: a one-line cron-log summary of the rotation.
 *
 *   "Spine manifest key-rotate: 14 patients, 14 pseudonyms changed
 *    (hashed, hex=16), no collisions."
 *   "Spine manifest key-rotate: 14 patients, 0 pseudonyms changed
 *    (hashed, hex=16), no collisions — no-op rotation."
 *   "Spine manifest key-rotate: 14 patients, 14 pseudonyms changed
 *    (hashed, hex=4), 1+ collision — widen hashHexLength."
 *   "Spine manifest key-rotate: 0 patients."
 */
export function summarizeSpineBatchCsvManifestAnonymiseKeyRotate(
  result: SpineBatchCsvManifestAnonymiseKeyRotateResult,
  options: SpineBatchCsvManifestAnonymiseKeyRotateOptions,
): string {
  const total = result.rotationEntries.length;
  if (total === 0) {
    return 'Spine manifest key-rotate: 0 patients.';
  }
  const changed = countSpineBatchCsvManifestAnonymiseKeyRotateChanges(result);
  const strategy = options.nameStrategy ?? 'hashed';
  const hexLen = options.hashHexLength ?? 16;
  const strategyPart =
    strategy === 'redacted'
      ? '(redacted)'
      : `(hashed, hex=${Math.max(4, Math.min(64, hexLen))})`;
  const collisionPart = result.collisionDetected
    ? `${changed > 0 ? '1+' : '0'} collision — widen hashHexLength`
    : 'no collisions';
  const noOpPart = result.noOpRotation ? ' — no-op rotation' : '';
  return (
    `Spine manifest key-rotate: ${total} ` +
    `${total === 1 ? 'patient' : 'patients'}, ${changed} ` +
    `${changed === 1 ? 'pseudonym' : 'pseudonyms'} changed ` +
    `${strategyPart}, ${collisionPart}${noOpPart}.`
  );
}

/**
 * Convenience: detect rotation entries whose old or new pseudonym
 * is "REDACTED" (either strategy 'redacted' OR a missing-name fall-
 * back). Useful for an in-house QA check before shipping the
 * rotation lookup: "did any patients end up with a degenerate
 * mapping that the printer can't reverse?"
 */
export function detectSpineBatchCsvManifestAnonymiseKeyRotateRedactedEntries(
  result: SpineBatchCsvManifestAnonymiseKeyRotateResult,
): SpineBatchCsvManifestAnonymiseKeyRotateEntry[] {
  return result.rotationEntries.filter(
    (e) =>
      e.oldPseudonymousName === 'REDACTED' ||
      e.newPseudonymousName === 'REDACTED',
  );
}
