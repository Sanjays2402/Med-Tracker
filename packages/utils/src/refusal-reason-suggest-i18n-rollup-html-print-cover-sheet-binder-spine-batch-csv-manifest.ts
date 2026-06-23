/**
 * Refusal reason suggest i18n rollup HTML print cover sheet —
 * binder-spine batch CSV MANIFEST.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch`
 * lays N binder-spine labels onto one or more sticker sheets. The
 * result is an HTML fragment plus a structured object with sheet
 * geometry — fine for code consumers, fine for the printer, but
 * useless for the QA workflow that has to confirm every patient on
 * the roster appears on at least one sticker sheet BEFORE printing.
 *
 * Real clinical-records QA workflows want a CSV MANIFEST:
 *
 *   - one row per spine (per patient label) with the assigned
 *     sheet number, row, column, and (1-based) position in the
 *     batch;
 *   - patient name + date label + panel label preserved verbatim
 *     so the auditor can cross-check the manifest against the
 *     source roster;
 *   - sheet totals at the top of the file as a header comment OR
 *     as a separate CSV (configurable).
 *
 * Two CSV exports in one call:
 *
 *   1. `manifestCsv` — one row per spine, columns:
 *      sheetNumber, totalSheets, rowOnSheet, columnOnSheet,
 *      positionInBatch, patientName, dateLabel, panelLabel.
 *
 *   2. `sheetSummaryCsv` — one row per sheet, columns:
 *      sheetNumber, totalSheets, spineCount, capacity.
 *
 * Empty / undefined cells are bare empty (not "null") matching the
 * MED_TRACKER CSV convention.
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch
 *   - computeSpineBatchCapacity (capacity calculation without rendering)
 */

import type {
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch,
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry,
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';
import {
  renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch,
  computeSpineBatchCapacity,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';

export interface SpineBatchCsvManifestOptions
  extends RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions {
  /** Prepend a UTF-8 BOM to both CSVs. Default false. */
  includeBom?: boolean;
}

export interface SpineBatchCsvManifestRow {
  sheetNumber: number;
  totalSheets: number;
  rowOnSheet: number;
  columnOnSheet: number;
  positionInBatch: number;
  patientName: string;
  dateLabel: string | null;
  panelLabel: string | null;
}

export interface SpineBatchCsvManifestSheetSummaryRow {
  sheetNumber: number;
  totalSheets: number;
  spineCount: number;
  capacity: number;
}

export interface SpineBatchCsvManifestResult {
  /** One row per spine. */
  manifestCsv: string;
  /** One row per sheet. */
  sheetSummaryCsv: string;
  /** Structured manifest rows (mirrors manifestCsv body). */
  manifestRows: SpineBatchCsvManifestRow[];
  /** Structured sheet summary rows. */
  sheetSummaryRows: SpineBatchCsvManifestSheetSummaryRow[];
  /** Manifest row count (excludes header). */
  manifestRowCount: number;
  /** Sheet summary row count (excludes header). */
  sheetSummaryRowCount: number;
}

const BOM = '\uFEFF';
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
const SHEET_SUMMARY_HEADER = [
  'sheetNumber',
  'totalSheets',
  'spineCount',
  'capacity',
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

/**
 * Build the CSV manifest for a spine batch.
 *
 * Walks the spine entries in input order, assigning each to a sheet +
 * row + column based on the resolved geometry (computed via
 * computeSpineBatchCapacity for the layout math). Renders the batch
 * HTML internally only to capture the sheet totals; callers that
 * already have a batch result can pass it via the `pre` option to
 * avoid the double-render.
 *
 * Pure / deterministic.
 */
export function exportSpineBatchCsvManifest(
  entries: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[],
  options: SpineBatchCsvManifestOptions = {},
): SpineBatchCsvManifestResult {
  const includeBom = options.includeBom ?? false;

  // Compute capacity (deterministic; no HTML render needed for the
  // layout math). Use the same capacity helper the batch render
  // uses so the manifest never disagrees with the rendered output.
  const capacity = computeSpineBatchCapacity(options);
  const spinesPerSheet = capacity.spinesPerSheet;
  const totalSpines = entries.length;
  const totalSheets =
    totalSpines === 0 ? 1 : Math.ceil(totalSpines / spinesPerSheet);

  // Build manifest rows: walk entries in input order; sheetNumber and
  // row/column come from the position within the batch.
  const manifestRows: SpineBatchCsvManifestRow[] = entries.map((entry, idx) => {
    const sheetIdx = Math.floor(idx / spinesPerSheet);
    const posOnSheet = idx - sheetIdx * spinesPerSheet;
    const rowOnSheet = Math.floor(posOnSheet / capacity.columnsPerSheet) + 1;
    const columnOnSheet = (posOnSheet % capacity.columnsPerSheet) + 1;
    return {
      sheetNumber: sheetIdx + 1,
      totalSheets,
      rowOnSheet,
      columnOnSheet,
      positionInBatch: idx + 1,
      patientName: entry.patientName,
      dateLabel: entry.dateLabel ?? null,
      panelLabel: entry.panelLabel ?? null,
    };
  });

  // Sheet summary rows: one per sheet with spine count + capacity.
  const sheetSummaryRows: SpineBatchCsvManifestSheetSummaryRow[] = [];
  for (let s = 0; s < totalSheets; s++) {
    const startIdx = s * spinesPerSheet;
    const endIdx = Math.min(startIdx + spinesPerSheet, totalSpines);
    sheetSummaryRows.push({
      sheetNumber: s + 1,
      totalSheets,
      spineCount: endIdx - startIdx,
      capacity: spinesPerSheet,
    });
  }

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

  const summaryBody = sheetSummaryRows.map((r) =>
    joinRow([r.sheetNumber, r.totalSheets, r.spineCount, r.capacity]),
  );
  const sheetSummaryCsv =
    (includeBom ? BOM : '') +
    [SHEET_SUMMARY_HEADER.join(','), ...summaryBody].join('\n');

  return {
    manifestCsv,
    sheetSummaryCsv,
    manifestRows,
    sheetSummaryRows,
    manifestRowCount: manifestRows.length,
    sheetSummaryRowCount: sheetSummaryRows.length,
  };
}

/**
 * Convenience: detect duplicate patient names within the manifest.
 *
 * A printer-auditor workflow flags when the same patient name appears
 * on two spines (probably a duplicate paste in the roster). Returns
 * the duplicates sorted by name with the per-occurrence sheet
 * coordinates so the auditor can find them quickly.
 */
export interface SpineBatchCsvManifestDuplicate {
  patientName: string;
  occurrences: Array<{
    sheetNumber: number;
    rowOnSheet: number;
    columnOnSheet: number;
    positionInBatch: number;
  }>;
}

export function detectSpineBatchCsvManifestDuplicates(
  result: SpineBatchCsvManifestResult,
): SpineBatchCsvManifestDuplicate[] {
  const byName = new Map<
    string,
    Array<{
      sheetNumber: number;
      rowOnSheet: number;
      columnOnSheet: number;
      positionInBatch: number;
    }>
  >();
  for (const r of result.manifestRows) {
    const list = byName.get(r.patientName) ?? [];
    list.push({
      sheetNumber: r.sheetNumber,
      rowOnSheet: r.rowOnSheet,
      columnOnSheet: r.columnOnSheet,
      positionInBatch: r.positionInBatch,
    });
    byName.set(r.patientName, list);
  }
  const dupes: SpineBatchCsvManifestDuplicate[] = [];
  for (const [name, occ] of byName.entries()) {
    if (occ.length > 1) {
      dupes.push({ patientName: name, occurrences: occ });
    }
  }
  dupes.sort((a, b) => a.patientName.localeCompare(b.patientName));
  return dupes;
}

/**
 * Convenience: render the spine batch HTML AND the CSV manifest in
 * one call. For QA workflows that want both artefacts at once
 * (printable HTML for the printer, CSV for the audit trail).
 */
export function exportSpineBatchHtmlAndManifest(
  entries: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[],
  options: SpineBatchCsvManifestOptions = {},
): {
  batch: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch;
  manifest: SpineBatchCsvManifestResult;
} {
  const batch = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
    entries,
    options,
  );
  const manifest = exportSpineBatchCsvManifest(entries, options);
  return { batch, manifest };
}

/**
 * Convenience: a one-line cron-log summary of the manifest.
 *
 *   "Spine manifest: 47 spines across 2 sheets (30 per sheet),
 *    no duplicates."
 *   "Spine manifest: 12 spines across 1 sheet (30 per sheet),
 *    2 duplicate names."
 */
export function summarizeSpineBatchCsvManifest(
  result: SpineBatchCsvManifestResult,
): string {
  const spines = result.manifestRowCount;
  const sheets = result.sheetSummaryRowCount;
  const cap = result.sheetSummaryRows[0]?.capacity ?? 0;
  const dupes = detectSpineBatchCsvManifestDuplicates(result);
  const dupesPart =
    dupes.length === 0
      ? 'no duplicates'
      : `${dupes.length} duplicate ${dupes.length === 1 ? 'name' : 'names'}`;
  return (
    `Spine manifest: ${spines} ${spines === 1 ? 'spine' : 'spines'} ` +
    `across ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} ` +
    `(${cap} per sheet), ${dupesPart}.`
  );
}
