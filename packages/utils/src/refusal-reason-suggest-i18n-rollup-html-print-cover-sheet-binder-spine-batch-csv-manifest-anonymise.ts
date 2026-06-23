/**
 * Refusal reason suggest i18n rollup HTML print cover sheet binder
 * spine BATCH CSV MANIFEST — ANONYMISE variant.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest`
 * exposes the per-spine roster as CSV; patient names + date labels +
 * panel labels appear in plain text. That's the right shape for an
 * in-house QA workflow where the auditor is already a PHI custodian.
 *
 * It's the WRONG shape for a third-party printer:
 *
 *   - sticker-paper print shops are not BAAs; sending them a CSV
 *     of patient names exposes PHI in transit and at rest;
 *   - the printer only needs the GEOMETRY (which sheet, which row,
 *     which column, what string goes on the label) — the underlying
 *     "this is Maria Lopez" identity is operationally irrelevant;
 *   - downstream label-printing pipelines (Avery / Brother) accept
 *     a CSV file unchanged, so the auditor can still queue jobs
 *     without exposing the source roster.
 *
 * This module is the anonymise companion. Same CSV shape as the base
 * manifest (sheetNumber / totalSheets / rowOnSheet / columnOnSheet /
 * positionInBatch / patientName / dateLabel / panelLabel) — but
 * patientName is hashed BEFORE the CSV is built so the manifest CSV
 * NEVER carries the source name.
 *
 * Hash strategy mirrors the existing anonymisation modules in the
 * package:
 *   - HMAC-SHA-256, secret-keyed, deterministic per (secret, name)
 *   - hex output truncated to a configurable length (default 16)
 *   - configurable prefix (default 'spine-')
 *   - two name strategies:
 *       'hashed'    -> "spine-7a3f1b2c"  (deterministic, recognisable)
 *       'redacted'  -> "REDACTED"        (most conservative)
 *
 * dateLabel + panelLabel pass through unchanged by default (they're
 * typically static text like "Q1 2026" or "Cardiology" — no PHI). When
 * preserveDateLabel=false or preservePanelLabel=false those cells
 * fall back to "REDACTED".
 *
 * A SECOND OUTPUT — the `nameLookupCsv` — exposes the source-to-hash
 * mapping (one row per original patient). This file stays IN-HOUSE
 * and lets the auditor reverse the hash when a label print error
 * arrives back at the clinic. The third-party printer never sees it.
 *
 * Pure / deterministic given a stable hmacSecret. ASYNC — uses Web
 * Crypto (globalThis.crypto.subtle) the same way the other anonymise
 * modules do (no @types/node dependency).
 *
 * Composes:
 *   - exportSpineBatchCsvManifest (the source manifest)
 *   - the HMAC-SHA-256 pipeline pattern from the regimen-snapshot
 *     anonymise module (DOES NOT IMPORT it — keeps each module
 *     independently revertible).
 */

import type {
  SpineBatchCsvManifestOptions,
  SpineBatchCsvManifestResult,
  SpineBatchCsvManifestRow,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest';
import { exportSpineBatchCsvManifest } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest';
import type { RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';

export type SpineBatchCsvManifestAnonymiseNameStrategy =
  | 'hashed'
  | 'redacted';

export interface SpineBatchCsvManifestAnonymiseOptions
  extends SpineBatchCsvManifestOptions {
  /**
   * HMAC secret used to hash patient names. MUST be at least 32
   * chars in production; we enforce the minimum length to catch
   * trivial misuse. Tests may pass a longer string for clarity.
   */
  hmacSecret: string;
  /**
   * Number of hex chars to keep from the HMAC output. Default 16
   * (8 bytes of entropy). Clamped to [4, 64].
   */
  hashHexLength?: number;
  /**
   * Prefix prepended to every hashed name so the cell is human-
   * recognisable as a pseudonym. Default 'spine-'.
   */
  hashPrefix?: string;
  /**
   * Strategy used to generate the pseudonymous name.
   *   - 'hashed' (default): "spine-7a3f1b2c"; deterministic across runs.
   *   - 'redacted': literal "REDACTED" for every row — the most
   *     conservative fallback for jurisdictions that don't accept
   *     pseudonyms as adequate de-identification.
   */
  nameStrategy?: SpineBatchCsvManifestAnonymiseNameStrategy;
  /**
   * When true (default), dateLabel passes through unchanged. When
   * false, dateLabel is rewritten to "REDACTED" wherever it was non-
   * null. Use when the dateLabel itself carries PHI ("DOB 1972-04-12").
   */
  preserveDateLabel?: boolean;
  /**
   * When true (default), panelLabel passes through unchanged. When
   * false, panelLabel is rewritten to "REDACTED" wherever it was non-
   * null. Use when the panel label itself carries PHI ("Lopez Family
   * Plan").
   */
  preservePanelLabel?: boolean;
}

export interface SpineBatchCsvManifestAnonymiseLookupRow {
  /** Original patient name (as supplied to the source roster). */
  originalPatientName: string;
  /** Pseudonymous name that appears in the anonymised manifest. */
  pseudonymousPatientName: string;
}

export interface SpineBatchCsvManifestAnonymiseResult {
  /** Anonymised manifest CSV (third-party-safe). */
  manifestCsv: string;
  /** Sheet summary CSV (no PHI; pass-through from source). */
  sheetSummaryCsv: string;
  /** In-house source-to-pseudonym lookup CSV. */
  nameLookupCsv: string;
  /** Anonymised manifest rows (structured form of manifestCsv body). */
  manifestRows: SpineBatchCsvManifestRow[];
  /** Source-to-pseudonym lookup rows (one per distinct source name). */
  lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[];
  /** Underlying manifest result (pre-anonymise; in-house only). */
  source: SpineBatchCsvManifestResult;
  /** Anonymised row count (mirrors manifestRows.length). */
  manifestRowCount: number;
  /** Count of distinct source patient names anonymised. */
  distinctPatientCount: number;
  /**
   * True when two different source names hashed to the SAME
   * pseudonymous name. Caller MUST widen hashHexLength before
   * shipping in this state.
   */
  collisionDetected: boolean;
}

const BOM = '\uFEFF';
const LOOKUP_HEADER = ['originalPatientName', 'pseudonymousPatientName'];
const MANIFEST_HEADER = [
  'sheetNumber',
  'totalSheets',
  'rowOnSheet',
  'columnOnSheet',
  'positionInBatch',
  'patientName',
  'dateLabel',
  'panelLabel',
];

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'number' ? String(value) : value;
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsvCell).join(',');
}

function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  // The buffer is an ArrayBuffer or SharedArrayBuffer; subtle.sign
  // accepts a BufferSource which covers both.
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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

async function hashName(
  key: CryptoKey,
  name: string,
  hashHexLength: number,
): Promise<string> {
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    asBufferSource(stringToBytes(name)),
  );
  const hex = bytesToHex(new Uint8Array(sig));
  const clamped = Math.max(4, Math.min(64, hashHexLength));
  return hex.slice(0, clamped);
}

function pseudonymForName(
  name: string,
  hashed: string,
  strategy: SpineBatchCsvManifestAnonymiseNameStrategy,
  prefix: string,
): string {
  if (strategy === 'redacted') return 'REDACTED';
  return `${prefix}${hashed}`;
}

/**
 * Build the anonymised manifest CSV from a spine batch.
 *
 * Walks the source manifest's rows, hashes each distinct patient name
 * with HMAC-SHA-256 (keyed on hmacSecret), then re-emits the manifest
 * CSV with the pseudonymous names. The sheet summary CSV passes
 * through unchanged (no PHI). A third lookup CSV exposes the source-
 * to-pseudonym mapping for in-house reversal — that file MUST stay
 * inside the BAA boundary.
 *
 * Pure / deterministic given a stable hmacSecret. Async (Web Crypto).
 */
export async function exportSpineBatchCsvManifestAnonymise(
  entries: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[],
  options: SpineBatchCsvManifestAnonymiseOptions,
): Promise<SpineBatchCsvManifestAnonymiseResult> {
  if (typeof options.hmacSecret !== 'string' || options.hmacSecret.length < 32) {
    throw new Error(
      'hmacSecret must be a string of at least 32 chars to avoid trivial misuse.',
    );
  }
  const hashHexLength = options.hashHexLength ?? 16;
  const hashPrefix = options.hashPrefix ?? 'spine-';
  const nameStrategy: SpineBatchCsvManifestAnonymiseNameStrategy =
    options.nameStrategy ?? 'hashed';
  const preserveDateLabel = options.preserveDateLabel ?? true;
  const preservePanelLabel = options.preservePanelLabel ?? true;
  const includeBom = options.includeBom ?? false;

  // Build the source manifest first; we only post-process the
  // patientName / dateLabel / panelLabel columns.
  const source = exportSpineBatchCsvManifest(entries, options);

  // Hash each distinct patient name ONCE (avoids N redundant subtle
  // calls when the same patient repeats on multiple spines).
  const key = await importHmacKey(options.hmacSecret);
  const distinctNames = Array.from(
    new Set(source.manifestRows.map((r) => r.patientName)),
  );
  const nameToPseudo = new Map<string, string>();
  if (nameStrategy === 'redacted') {
    for (const n of distinctNames) {
      nameToPseudo.set(n, 'REDACTED');
    }
  } else {
    const hashes = await Promise.all(
      distinctNames.map((n) => hashName(key, n, hashHexLength)),
    );
    for (let i = 0; i < distinctNames.length; i++) {
      nameToPseudo.set(
        distinctNames[i]!,
        pseudonymForName(
          distinctNames[i]!,
          hashes[i]!,
          nameStrategy,
          hashPrefix,
        ),
      );
    }
  }

  // Collision detection: two distinct source names mapping to the same
  // pseudonym. Only meaningful for 'hashed' strategy ('redacted' maps
  // every name to "REDACTED" by design).
  let collisionDetected = false;
  if (nameStrategy === 'hashed') {
    const pseudoSet = new Set<string>();
    for (const p of nameToPseudo.values()) {
      if (pseudoSet.has(p)) {
        collisionDetected = true;
        break;
      }
      pseudoSet.add(p);
    }
  }

  // Rewrite the manifest rows with the anonymised cells.
  const manifestRows: SpineBatchCsvManifestRow[] = source.manifestRows.map(
    (r) => {
      const dateLabel =
        preserveDateLabel || r.dateLabel === null
          ? r.dateLabel
          : 'REDACTED';
      const panelLabel =
        preservePanelLabel || r.panelLabel === null
          ? r.panelLabel
          : 'REDACTED';
      return {
        sheetNumber: r.sheetNumber,
        totalSheets: r.totalSheets,
        rowOnSheet: r.rowOnSheet,
        columnOnSheet: r.columnOnSheet,
        positionInBatch: r.positionInBatch,
        patientName: nameToPseudo.get(r.patientName) ?? 'REDACTED',
        dateLabel,
        panelLabel,
      };
    },
  );

  // Build the anonymised manifest CSV.
  const manifestBody = manifestRows.map((r) =>
    joinRow([
      r.sheetNumber,
      r.totalSheets,
      r.rowOnSheet,
      r.columnOnSheet,
      r.positionInBatch,
      r.patientName,
      r.dateLabel,
      r.panelLabel,
    ]),
  );
  const manifestCsv =
    (includeBom ? BOM : '') +
    [MANIFEST_HEADER.join(','), ...manifestBody].join('\n');

  // Lookup CSV — sorted by original name ascending so the in-house
  // auditor's reversal table is browseable.
  const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = distinctNames
    .map((n) => ({
      originalPatientName: n,
      pseudonymousPatientName: nameToPseudo.get(n)!,
    }))
    .sort((a, b) => a.originalPatientName.localeCompare(b.originalPatientName));
  const lookupBody = lookupRows.map((r) =>
    joinRow([r.originalPatientName, r.pseudonymousPatientName]),
  );
  const nameLookupCsv =
    (includeBom ? BOM : '') +
    [LOOKUP_HEADER.join(','), ...lookupBody].join('\n');

  return {
    manifestCsv,
    sheetSummaryCsv: source.sheetSummaryCsv,
    nameLookupCsv,
    manifestRows,
    lookupRows,
    source,
    manifestRowCount: manifestRows.length,
    distinctPatientCount: distinctNames.length,
    collisionDetected,
  };
}

/**
 * Convenience: a one-line cron-log summary of the anonymise.
 *
 *   "Spine manifest anonymise: 47 rows, 14 distinct patients hashed
 *    (hashed, hex=16), no collisions."
 *   "Spine manifest anonymise: 12 rows, 12 distinct patients hashed
 *    (redacted), no collisions."
 *   "Spine manifest anonymise: 8 rows, 8 distinct patients hashed
 *    (hashed, hex=4), 1 collision — widen hashHexLength."
 */
export function summarizeSpineBatchCsvManifestAnonymise(
  result: SpineBatchCsvManifestAnonymiseResult,
  options: SpineBatchCsvManifestAnonymiseOptions,
): string {
  const strategy = options.nameStrategy ?? 'hashed';
  const hexLen = options.hashHexLength ?? 16;
  const strategyPart =
    strategy === 'redacted'
      ? '(redacted)'
      : `(hashed, hex=${Math.max(4, Math.min(64, hexLen))})`;
  const collisionPart = result.collisionDetected
    ? `${result.distinctPatientCount === 0 ? '0' : '1+'} collision — widen hashHexLength`
    : 'no collisions';
  return (
    `Spine manifest anonymise: ${result.manifestRowCount} ` +
    `${result.manifestRowCount === 1 ? 'row' : 'rows'}, ` +
    `${result.distinctPatientCount} distinct ` +
    `${result.distinctPatientCount === 1 ? 'patient' : 'patients'} hashed ` +
    `${strategyPart}, ${collisionPart}.`
  );
}

/**
 * Convenience: detect manifest rows whose patientName ended up as
 * "REDACTED" (either because nameStrategy='redacted' OR because the
 * source row arrived with an empty / sentinel patientName). Useful
 * for an in-house QA check before shipping the CSV: "are any rows
 * fully redacted by accident?"
 */
export function detectSpineBatchCsvManifestAnonymiseRedactedRows(
  result: SpineBatchCsvManifestAnonymiseResult,
): SpineBatchCsvManifestRow[] {
  return result.manifestRows.filter((r) => r.patientName === 'REDACTED');
}
