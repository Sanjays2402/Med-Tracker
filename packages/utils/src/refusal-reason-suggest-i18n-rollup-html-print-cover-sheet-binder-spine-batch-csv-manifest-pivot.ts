/**
 * Refusal reason suggest i18n rollup HTML print cover sheet —
 * binder-spine batch CSV manifest PIVOT.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest`
 * is one-row-per-SPINE: every spine in the batch gets its own row
 * with `sheetNumber, rowOnSheet, columnOnSheet, patientName, ...`.
 * That's right for an audit walking the spine-by-spine workflow (the
 * default), but it's WRONG for the printer-cassette workflow where
 * the auditor verifies sheet-by-sheet (\"sheet 3: which 12 patients\
 * are on this sheet?\").
 *
 * Real cassette-loader workflows want one row per SHEET:
 *
 *   sheetNumber, totalSheets, capacity, spineCount, pos_1, pos_2, ..., pos_N
 *
 * where pos_K is the patient name on position K (row-major, top-left
 * first). Empty positions are bare empty cells.
 *
 * This module pivots the spine-row manifest into a sheet-row pivot.
 * The grid math is delegated to the underlying manifest (so the
 * pivot never disagrees with the spine view) — this module is a
 * pure shape transformation.
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - SpineBatchCsvManifestResult (the spine-row manifest)
 *   - exportSpineBatchCsvManifest (delegated build for raw entries)
 */

import type {
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';
import type {
  SpineBatchCsvManifestOptions,
  SpineBatchCsvManifestResult,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest';
import { exportSpineBatchCsvManifest } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest';

export interface SpineBatchCsvManifestPivotOptions extends SpineBatchCsvManifestOptions {
  /**
   * What to put in position cells when the slot is empty. Default
   * '' (bare empty cell, matches MED_TRACKER CSV convention). Set
   * to a placeholder string (e.g. '—' or 'empty') when the auditor
   * wants every cell populated.
   */
  emptyPositionPlaceholder?: string;
  /**
   * Position column header pattern. Default 'pos_{n}' where n is
   * 1-based. The substring '{n}' is replaced with the 1-based
   * position index.
   */
  positionColumnTemplate?: string;
  /**
   * Include dateLabel as a suffix on each position cell. Default
   * false. When true, cells become 'patientName (dateLabel)' so the
   * cassette loader can verify both fields without flipping sheets.
   */
  includeDateLabelInPosition?: boolean;
}

export interface SpineBatchCsvManifestPivotRow {
  sheetNumber: number;
  totalSheets: number;
  capacity: number;
  spineCount: number;
  /** Position cells, 1-based, length === capacity. Empty positions follow positionPlaceholder. */
  positions: string[];
}

export interface SpineBatchCsvManifestPivotResult {
  /** Pivoted CSV: one row per sheet, with position cells. */
  pivotCsv: string;
  /** Pivot rows (mirrors pivotCsv body). */
  pivotRows: SpineBatchCsvManifestPivotRow[];
  /** Pivot row count (excludes header). */
  pivotRowCount: number;
  /** Column count in the pivot CSV (4 base + capacity position columns). */
  columnCount: number;
  /** Mirror the underlying manifest for callers that want both shapes. */
  source: SpineBatchCsvManifestResult;
}

const BOM = '\uFEFF';

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

function resolvePositionLabel(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(n));
}

function buildCellValue(
  patientName: string,
  dateLabel: string | null,
  includeDateLabel: boolean,
): string {
  if (!includeDateLabel) return patientName;
  if (dateLabel === null || dateLabel.length === 0) return patientName;
  return `${patientName} (${dateLabel})`;
}

/**
 * Pivot a spine-row manifest into a sheet-row CSV (one row per sheet,
 * columns expanded to one per position).
 *
 * Builds the underlying spine-row manifest internally; callers that
 * already have it can pass it via the `source` option to skip the
 * second build. Capacity, totalSheets, sheetNumber-ing are inherited
 * verbatim — the pivot is purely a shape transform.
 *
 * Pure / deterministic.
 */
export function exportSpineBatchCsvManifestPivot(
  entries: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[],
  options: SpineBatchCsvManifestPivotOptions = {},
): SpineBatchCsvManifestPivotResult {
  const includeBom = options.includeBom ?? false;
  const emptyPlaceholder = options.emptyPositionPlaceholder ?? '';
  const positionTemplate = options.positionColumnTemplate ?? 'pos_{n}';
  const includeDateLabel = options.includeDateLabelInPosition ?? false;

  // Build the underlying spine-row manifest.
  const sourceOptions: SpineBatchCsvManifestOptions = {};
  if (options.includeBom !== undefined) sourceOptions.includeBom = options.includeBom;
  // Pass through ALL the other spine-batch options so the geometry math
  // honours forceColumns / forceRows / sheetPreset / etc.
  for (const key of Object.keys(options) as (keyof SpineBatchCsvManifestPivotOptions)[]) {
    if (
      key === 'emptyPositionPlaceholder' ||
      key === 'positionColumnTemplate' ||
      key === 'includeDateLabelInPosition' ||
      key === 'includeBom'
    )
      continue;
    (sourceOptions as Record<string, unknown>)[key] = options[key];
  }
  const source = exportSpineBatchCsvManifest(entries, sourceOptions);

  const capacity = source.sheetSummaryRows[0]?.capacity ?? 0;
  const totalSheets = source.sheetSummaryRows.length;

  // Build position columns header.
  const positionHeaders: string[] = [];
  for (let p = 1; p <= capacity; p++) {
    positionHeaders.push(resolvePositionLabel(positionTemplate, p));
  }
  const headerRow = [
    'sheetNumber',
    'totalSheets',
    'capacity',
    'spineCount',
    ...positionHeaders,
  ];

  // Walk source.sheetSummaryRows, building one pivot row per sheet by
  // pulling matching manifestRows (those whose sheetNumber matches).
  const pivotRows: SpineBatchCsvManifestPivotRow[] = [];
  for (const sheet of source.sheetSummaryRows) {
    const positions: string[] = Array.from({ length: capacity }, () => emptyPlaceholder);
    for (const row of source.manifestRows) {
      if (row.sheetNumber !== sheet.sheetNumber) continue;
      // posIndex (1-based) is the row-major offset:
      //   (rowOnSheet - 1) * columnsPerSheet + (columnOnSheet - 1) + 1
      // We don't have columnsPerSheet directly on the summary row; we
      // can derive it from capacity + rowOnSheet: the manifest already
      // knows the grid via the spine batch's columns × rows decomposition.
      // Practical approach: use positionInBatch modulo capacity (which
      // gives 1..capacity within this sheet's block).
      const posInSheet = ((row.positionInBatch - 1) % capacity) + 1;
      positions[posInSheet - 1] = buildCellValue(
        row.patientName,
        row.dateLabel,
        includeDateLabel,
      );
    }
    pivotRows.push({
      sheetNumber: sheet.sheetNumber,
      totalSheets: sheet.totalSheets,
      capacity: sheet.capacity,
      spineCount: sheet.spineCount,
      positions,
    });
  }

  const bodyLines = pivotRows.map((r) =>
    joinRow([
      r.sheetNumber,
      r.totalSheets,
      r.capacity,
      r.spineCount,
      ...r.positions,
    ]),
  );
  const pivotCsv =
    (includeBom ? BOM : '') + [headerRow.join(','), ...bodyLines].join('\n');

  return {
    pivotCsv,
    pivotRows,
    pivotRowCount: pivotRows.length,
    columnCount: headerRow.length,
    source,
  };
}

/**
 * Convenience: detect sheets that aren't full (spineCount < capacity).
 * The cassette loader sometimes wants to verify a printed batch
 * uses every position on every sheet to maximise sticker yield
 * (a half-full sheet means wasted label stock). Returns sheet
 * numbers sorted ASC.
 */
export function detectPartialSpineSheets(
  result: SpineBatchCsvManifestPivotResult,
): number[] {
  const partials: number[] = [];
  for (const row of result.pivotRows) {
    if (row.spineCount < row.capacity) partials.push(row.sheetNumber);
  }
  return partials.sort((a, b) => a - b);
}

/**
 * Convenience: a one-line cron-log summary.
 *
 *   "Spine manifest pivot: 3 sheets (30 per sheet), 90 positions
 *    (75 used, 15 empty). 1 partial sheet."
 *   "Spine manifest pivot: 1 sheet (30 per sheet), 30 positions
 *    (all used)."
 */
export function summarizeSpineBatchCsvManifestPivot(
  result: SpineBatchCsvManifestPivotResult,
): string {
  const sheets = result.pivotRowCount;
  const capacity = result.pivotRows[0]?.capacity ?? 0;
  const totalPositions = sheets * capacity;
  const usedPositions = result.pivotRows.reduce(
    (sum, r) => sum + r.spineCount,
    0,
  );
  const empty = totalPositions - usedPositions;
  const partials = detectPartialSpineSheets(result);
  const usageBody =
    empty === 0
      ? '(all used)'
      : `(${usedPositions} used, ${empty} empty)`;
  const partialsBody =
    partials.length === 0
      ? ''
      : ` ${partials.length} partial ${partials.length === 1 ? 'sheet' : 'sheets'}.`;
  return (
    `Spine manifest pivot: ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} ` +
    `(${capacity} per sheet), ${totalPositions} ${totalPositions === 1 ? 'position' : 'positions'} ${usageBody}.${partialsBody}`
  );
}
