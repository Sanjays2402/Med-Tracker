/**
 * Regimen snapshot archive history rollup — CSV export merge,
 * anonymisation key-rotation BULK CSV export.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk`
 * builds a chain of per-epoch pseudonyms across N+1 secret epochs.
 * The result is a structured object — fine for code consumers,
 * useless for the analytics-partner audit team who reads CSVs in
 * Excel/Numbers.
 *
 * Real audit hand-offs want a CSV:
 *
 *   - one row per patient (terminal mapping or full chain);
 *   - epoch columns named after the supplied epochLabels so the
 *     partner doesn't have to keep a separate label sheet;
 *   - opt-in includeOriginalIds (PHI under HIPAA safe-harbour;
 *     OFF by default) for the rare case where the partner already
 *     has the original ids on file;
 *   - a parallel transitions CSV (one row per epoch transition)
 *     with the per-transition no-op / collision flags so the
 *     auditor can scan rotation health without scrolling N patient
 *     rows.
 *
 * Two CSV exports:
 *
 *   1. `chainsCsv` — one row per patient with the full epoch chain
 *      (columns: [originalPatientId], [originalPatientName],
 *      <label>_id, <label>_name, ...).
 *
 *   2. `transitionsCsv` — one row per (fromEpoch -> toEpoch)
 *      transition (columns: fromEpoch, toEpoch, fromEpochLabel,
 *      toEpochLabel, patientCount, noOpRotation, collisionDetected).
 *
 * MED_TRACKER CSV conventions match `dose-export-csv` and
 * `regimen-snapshot-archive-history-rollup-csv-export`:
 *   - UTF-8 with optional BOM (includeBom).
 *   - Header row always emitted, even for an empty body.
 *   - Empty / undefined fields are bare empty cells (`,,`).
 *   - Cells containing comma / quote / newline are RFC 4180 escaped.
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - RegimenHistoryAnonymiseKeyRotateBulkResult
 */

import type {
  RegimenHistoryAnonymiseKeyRotateBulkPatientChain,
  RegimenHistoryAnonymiseKeyRotateBulkResult,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';

export type AnonymiseKeyRotateBulkCsvExportSortBy =
  | 'first-epoch-pseudonym'
  | 'last-epoch-pseudonym'
  | 'patient-id'
  | 'input';

export type AnonymiseKeyRotateBulkCsvExportColumns =
  | 'ids-only'
  | 'names-only'
  | 'ids-and-names';

export interface AnonymiseKeyRotateBulkCsvExportOptions {
  /** Prepend a UTF-8 BOM (\uFEFF) so Excel-on-Windows opens it as UTF-8. Default false. */
  includeBom?: boolean;
  /**
   * Include the originalPatientId + originalPatientName columns. OFF
   * by default because the resulting CSV is PHI under HIPAA safe
   * harbour — most audit consumers want the non-PHI variant.
   */
  includeOriginalIds?: boolean;
  /**
   * Which epoch-pseudonym columns to include. Default 'ids-and-names'.
   * Pure-id exports are smaller and the typical audit case; the
   * names columns are kept for the rare partner that joins on name.
   */
  epochColumns?: AnonymiseKeyRotateBulkCsvExportColumns;
  /**
   * Row sort order. Default 'first-epoch-pseudonym' (lexical) so the
   * same patient lands on the same row across runs.
   * 'patient-id' requires includeOriginalIds=true.
   */
  sortBy?: AnonymiseKeyRotateBulkCsvExportSortBy;
}

export interface AnonymiseKeyRotateBulkCsvExportResult {
  /** One row per patient with the full epoch chain. */
  chainsCsv: string;
  /** One row per (fromEpoch -> toEpoch) transition. */
  transitionsCsv: string;
  /** Row count in chainsCsv body (excludes header). */
  chainRowCount: number;
  /** Row count in transitionsCsv body (excludes header). */
  transitionRowCount: number;
  /** Header columns actually emitted for chainsCsv. */
  chainColumns: string[];
  /** Header columns actually emitted for transitionsCsv. */
  transitionColumns: string[];
}

const BOM = '\uFEFF';
const TRANSITIONS_HEADER = [
  'fromEpoch',
  'toEpoch',
  'fromEpochLabel',
  'toEpochLabel',
  'patientCount',
  'noOpRotation',
  'collisionDetected',
];

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinRow(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(escapeCsvCell).join(',');
}

function sortChains(
  chains: RegimenHistoryAnonymiseKeyRotateBulkPatientChain[],
  sortBy: AnonymiseKeyRotateBulkCsvExportSortBy,
  includeOriginalIds: boolean,
): RegimenHistoryAnonymiseKeyRotateBulkPatientChain[] {
  if (sortBy === 'input') return [...chains];
  const cloned = [...chains];
  if (sortBy === 'patient-id') {
    if (!includeOriginalIds) {
      throw new Error(
        "sortBy='patient-id' requires includeOriginalIds=true (the column has to exist).",
      );
    }
    cloned.sort((a, b) => a.originalPatientId.localeCompare(b.originalPatientId));
    return cloned;
  }
  if (sortBy === 'last-epoch-pseudonym') {
    cloned.sort((a, b) => {
      const ai = a.pseudonymousIdChain[a.pseudonymousIdChain.length - 1] ?? '';
      const bi = b.pseudonymousIdChain[b.pseudonymousIdChain.length - 1] ?? '';
      return ai.localeCompare(bi);
    });
    return cloned;
  }
  // 'first-epoch-pseudonym' default
  cloned.sort((a, b) => {
    const ai = a.pseudonymousIdChain[0] ?? '';
    const bi = b.pseudonymousIdChain[0] ?? '';
    return ai.localeCompare(bi);
  });
  return cloned;
}

function buildChainColumns(
  epochLabels: string[],
  includeOriginalIds: boolean,
  epochColumns: AnonymiseKeyRotateBulkCsvExportColumns,
): string[] {
  const cols: string[] = [];
  if (includeOriginalIds) {
    cols.push('originalPatientId', 'originalPatientName');
  }
  const wantIds = epochColumns === 'ids-only' || epochColumns === 'ids-and-names';
  const wantNames = epochColumns === 'names-only' || epochColumns === 'ids-and-names';
  for (const label of epochLabels) {
    if (wantIds) cols.push(`${label}_id`);
    if (wantNames) cols.push(`${label}_name`);
  }
  return cols;
}

function rowForChain(
  chain: RegimenHistoryAnonymiseKeyRotateBulkPatientChain,
  includeOriginalIds: boolean,
  epochColumns: AnonymiseKeyRotateBulkCsvExportColumns,
  epochCount: number,
): (string | null)[] {
  const out: (string | null)[] = [];
  if (includeOriginalIds) {
    out.push(chain.originalPatientId, chain.originalPatientName);
  }
  const wantIds = epochColumns === 'ids-only' || epochColumns === 'ids-and-names';
  const wantNames = epochColumns === 'names-only' || epochColumns === 'ids-and-names';
  for (let i = 0; i < epochCount; i++) {
    if (wantIds) out.push(chain.pseudonymousIdChain[i] ?? '');
    if (wantNames) out.push(chain.pseudonymousNameChain[i] ?? '');
  }
  return out;
}

/**
 * Build the two CSV exports for a bulk key-rotation result.
 *
 * `chainsCsv` carries the per-patient chain; `transitionsCsv` carries
 * the per-transition summary. Both are emitted together because the
 * audit hand-off typically wants BOTH (patient-level lookups + a
 * one-page rotation health summary).
 *
 * Pure / deterministic.
 */
export function exportAnonymiseKeyRotateBulkCsv(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
  options: AnonymiseKeyRotateBulkCsvExportOptions = {},
): AnonymiseKeyRotateBulkCsvExportResult {
  const includeBom = options.includeBom ?? false;
  const includeOriginalIds = options.includeOriginalIds ?? false;
  const epochColumns = options.epochColumns ?? 'ids-and-names';
  const sortBy = options.sortBy ?? 'first-epoch-pseudonym';

  const chainColumns = buildChainColumns(
    result.epochLabels,
    includeOriginalIds,
    epochColumns,
  );

  const sortedChains = sortChains(result.patientChains, sortBy, includeOriginalIds);
  const chainRows = sortedChains.map((c) =>
    rowForChain(c, includeOriginalIds, epochColumns, result.epochCount),
  );
  const chainHeaderLine = chainColumns.join(',');
  const chainBodyLines = chainRows.map((r) => joinRow(r));
  const chainsCsv =
    (includeBom ? BOM : '') +
    [chainHeaderLine, ...chainBodyLines].join('\n');

  // Transitions CSV: one row per transition. patientCount = unique
  // patient count under the underlying anonymise result. We treat
  // it as the count of mappings emitted by buildAnonymiseKeyRotation.
  const transitionsHeaderLine = TRANSITIONS_HEADER.join(',');
  const transitionBodyLines = result.transitions.map((t) => {
    const patientCount = t.result.mappings.length;
    return joinRow([
      t.fromEpoch,
      t.toEpoch,
      t.fromEpochLabel,
      t.toEpochLabel,
      patientCount,
      t.result.noOpRotation,
      t.result.collisionDetected,
    ]);
  });
  const transitionsCsv =
    (includeBom ? BOM : '') +
    [transitionsHeaderLine, ...transitionBodyLines].join('\n');

  return {
    chainsCsv,
    transitionsCsv,
    chainRowCount: chainRows.length,
    transitionRowCount: result.transitions.length,
    chainColumns,
    transitionColumns: TRANSITIONS_HEADER,
  };
}

/**
 * Convenience: export ONLY the terminal mapping (first-epoch ->
 * last-epoch) as a CSV. For the most common audit lookup
 * ("I have ancient data; what's the current pseudonym?"). Produces
 * a focussed sheet with at most 4 columns:
 *
 *   firstEpochPseudonymousId, firstEpochPseudonymousName,
 *   lastEpochPseudonymousId, lastEpochPseudonymousName
 *
 * (or 6 columns when includeOriginalIds=true).
 */
export function exportAnonymiseKeyRotateBulkTerminalCsv(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
  options: Pick<
    AnonymiseKeyRotateBulkCsvExportOptions,
    'includeBom' | 'includeOriginalIds'
  > = {},
): { csv: string; rowCount: number; columns: string[] } {
  const includeBom = options.includeBom ?? false;
  const includeOriginalIds = options.includeOriginalIds ?? false;
  const columns: string[] = [];
  if (includeOriginalIds) {
    columns.push('originalPatientId', 'originalPatientName');
  }
  columns.push(
    'firstEpochPseudonymousId',
    'firstEpochPseudonymousName',
    'lastEpochPseudonymousId',
    'lastEpochPseudonymousName',
  );

  const rows = result.terminals.map((t) => {
    const row: (string | null)[] = [];
    if (includeOriginalIds) row.push(t.originalPatientId, t.originalPatientName);
    row.push(
      t.firstEpochPseudonymousId,
      t.firstEpochPseudonymousName,
      t.lastEpochPseudonymousId,
      t.lastEpochPseudonymousName,
    );
    return row;
  });

  const csv =
    (includeBom ? BOM : '') +
    [columns.join(','), ...rows.map((r) => joinRow(r))].join('\n');
  return { csv, rowCount: rows.length, columns };
}

/**
 * Convenience: a one-line cron-log summary of the export.
 *
 *   "Bulk key-rotate CSV: 14 patient chains over 5 epochs (4
 *    transitions, 0 no-op, no collisions)."
 *   "Bulk key-rotate CSV: 14 patient chains over 5 epochs (4
 *    transitions, 1 no-op, collisions detected at one or more epochs)."
 */
export function summarizeAnonymiseKeyRotateBulkCsvExport(
  result: AnonymiseKeyRotateBulkCsvExportResult,
  bulk: RegimenHistoryAnonymiseKeyRotateBulkResult,
): string {
  const t = result.chainRowCount;
  const e = bulk.epochCount;
  const tr = bulk.transitionCount;
  const nop = bulk.noOpTransitionCount;
  const col = bulk.collisionDetectedAtAnyEpoch
    ? 'collisions detected at one or more epochs'
    : 'no collisions';
  return (
    `Bulk key-rotate CSV: ${t} ${t === 1 ? 'patient chain' : 'patient chains'} over ${e} ${e === 1 ? 'epoch' : 'epochs'} ` +
    `(${tr} ${tr === 1 ? 'transition' : 'transitions'}, ${nop} no-op, ${col}).`
  );
}
