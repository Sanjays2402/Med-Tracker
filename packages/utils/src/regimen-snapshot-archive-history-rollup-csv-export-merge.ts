/**
 * Regimen snapshot archive history rollup — CSV export merge.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export` ships per-
 * patient CSV exports (eventsCsv + timelineCsv). The pediatric-
 * cardiology family-history use case asks for a single combined
 * sheet: sibling 1's events + sibling 2's events stacked into one
 * spreadsheet so the clinician scrolls one tab, not two.
 *
 * This module merges N per-patient CSV exports into a SINGLE
 * combined CSV with two new leading columns:
 *
 *   patientId, patientName, snapshotId, takenAt, medicationId,
 *   medicationName, kind, before, after
 *
 * (and for the timeline:)
 *
 *   patientId, patientName, snapshotId, takenAt, itemCount, delta
 *
 * MED_TRACKER CSV conventions match the per-patient export:
 *   - UTF-8 with optional BOM (opt-in via options.includeBom).
 *   - Single header row at the top, even if all inputs are empty.
 *   - Bare empty cells for null fields (NOT the literal string
 *     "null") so spreadsheet formulas treat them as blank.
 *   - RFC 4180 escaping for cells containing comma, quote, CR, LF.
 *   - LF line endings (matches the per-patient export so a
 *     downstream sed/awk pipeline that handled one handles the
 *     merged version unchanged).
 *
 * Merge ordering follows the input array order (sibling 1 rows
 * first, sibling 2 rows after) so the clinician can predict the
 * scroll position of each patient's rows. Within a patient block,
 * the per-patient CSV's row order is preserved verbatim — we do
 * NOT re-sort events on merge because the per-patient export
 * already exposed the eventOrder option for that.
 *
 * The merger DOES NOT re-parse the input CSV bodies. It treats
 * each input as an OPAQUE STRING after stripping the header, then
 * prepends the two patient columns to each body row. This keeps
 * the merger robust against per-patient CSV evolution (new columns,
 * formatting tweaks) — as long as the per-patient export's header
 * remains the well-known fixed string, the merger just glues
 * patient columns onto each body row.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  RegimenHistoryCsvExportOptions,
  RegimenHistoryCsvExportResult,
} from './regimen-snapshot-archive-history-rollup-csv-export';
import {
  exportRegimenHistoryRollupCsv,
} from './regimen-snapshot-archive-history-rollup-csv-export';
import type { RegimenHistoryRollup } from './regimen-snapshot-archive-history-rollup';

/** Per-patient slice fed into the merger. */
export interface RegimenHistoryCsvMergeInput {
  /** Stable patient identifier rendered as the first column. */
  patientId: string;
  /** Human-readable patient name rendered as the second column. */
  patientName: string;
  /**
   * Either a pre-built RegimenHistoryCsvExportResult (the caller
   * already exported per-patient and wants to merge) OR a
   * RegimenHistoryRollup that the merger will export internally.
   * Picking one or the other is purely about whether the caller
   * already paid the export cost.
   */
  export?: RegimenHistoryCsvExportResult;
  /** Alternative to `export`: have the merger run the per-patient export. */
  rollup?: RegimenHistoryRollup;
}

export interface RegimenHistoryCsvMergeOptions {
  /** Prepend a UTF-8 BOM (\uFEFF). Default false. */
  includeBom?: boolean;
  /**
   * Per-patient export options forwarded to the merger's internal
   * exporter when a slice passes a `rollup` instead of a pre-built
   * export result. Ignored for slices that pass `export`.
   */
  perPatientExportOptions?: RegimenHistoryCsvExportOptions;
}

export interface RegimenHistoryCsvMergeResult {
  /** Combined eventsCsv across all patients. */
  eventsCsv: string;
  /** Combined timelineCsv across all patients. */
  timelineCsv: string;
  /** Total event row count in eventsCsv (excludes header). */
  eventRowCount: number;
  /** Total timeline row count in timelineCsv (excludes header). */
  timelineRowCount: number;
  /** Per-patient row counts in the merged eventsCsv body. */
  perPatientEventRowCounts: Record<string, number>;
  /** Per-patient row counts in the merged timelineCsv body. */
  perPatientTimelineRowCounts: Record<string, number>;
  /** Patient ids appearing in the merged output, in input order. */
  patientIds: string[];
}

const MERGED_EVENTS_HEADER =
  'patientId,patientName,snapshotId,takenAt,medicationId,medicationName,kind,before,after';
const MERGED_TIMELINE_HEADER =
  'patientId,patientName,snapshotId,takenAt,itemCount,delta';

const BOM = '\uFEFF';
const LF = '\n';

const PER_PATIENT_EVENTS_HEADER =
  'snapshotId,takenAt,medicationId,medicationName,kind,before,after';
const PER_PATIENT_TIMELINE_HEADER = 'snapshotId,takenAt,itemCount,delta';

function escapeCsvCell(value: string): string {
  if (value === '') return '';
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function stripBom(s: string): string {
  return s.startsWith(BOM) ? s.slice(1) : s;
}

interface SplitCsv {
  bodyLines: string[];
  /** True when the input was empty (no rows after the header). */
  empty: boolean;
}

function splitBody(csv: string, expectedHeader: string): SplitCsv {
  const cleaned = stripBom(csv);
  // Trim a trailing LF so we don't pick up a phantom empty row when
  // the per-patient exporter appends "\n" after the body. Multiple
  // trailing LFs are dropped too (defensive — the exporter today
  // emits exactly one but downstream tooling may double it).
  let trimmed = cleaned;
  while (trimmed.endsWith(LF)) trimmed = trimmed.slice(0, -1);
  const lines = trimmed.length === 0 ? [] : trimmed.split(LF);
  if (lines.length === 0) return { bodyLines: [], empty: true };
  // Drop the header row. We don't strictly require it to match the
  // expectedHeader byte-for-byte (a future per-patient export adding
  // a column should still merge), but we DO require *some* header
  // line is present; we treat the first row as a header always.
  // expectedHeader unused at runtime; retained as a doc/test anchor.
  void expectedHeader;
  const bodyLines = lines.slice(1);
  return { bodyLines, empty: bodyLines.length === 0 };
}

function prependPatientColumns(
  bodyLines: string[],
  patientId: string,
  patientName: string,
): string[] {
  if (bodyLines.length === 0) return [];
  const idCell = escapeCsvCell(patientId);
  const nameCell = escapeCsvCell(patientName);
  const prefix = `${idCell},${nameCell},`;
  return bodyLines.map((line) => prefix + line);
}

function resolveExport(
  slice: RegimenHistoryCsvMergeInput,
  perPatientOptions: RegimenHistoryCsvExportOptions | undefined,
): RegimenHistoryCsvExportResult {
  if (slice.export) return slice.export;
  if (slice.rollup) {
    // Per-patient BOM never propagates through the merge — the
    // merger owns the BOM decision for the combined output, so we
    // explicitly strip it from the per-patient export options.
    return exportRegimenHistoryRollupCsv(slice.rollup, {
      ...(perPatientOptions ?? {}),
      includeBom: false,
    });
  }
  throw new Error(
    `Merge input for patient ${slice.patientId} must provide either 'export' or 'rollup'.`,
  );
}

/**
 * Merge N per-patient CSV exports into a single combined CSV.
 * Each merged row gains two leading columns (patientId, patientName)
 * before the per-patient export's original columns.
 *
 * Pure / deterministic. Empty input list produces header-only CSVs
 * (still a valid spreadsheet open).
 */
export function mergeRegimenHistoryRollupCsvExports(
  slices: RegimenHistoryCsvMergeInput[],
  options: RegimenHistoryCsvMergeOptions = {},
): RegimenHistoryCsvMergeResult {
  const includeBom = options.includeBom ?? false;
  const prefix = includeBom ? BOM : '';

  const eventsBody: string[] = [];
  const timelineBody: string[] = [];
  const perPatientEventRowCounts: Record<string, number> = {};
  const perPatientTimelineRowCounts: Record<string, number> = {};
  const patientIds: string[] = [];

  for (const slice of slices) {
    const exp = resolveExport(slice, options.perPatientExportOptions);
    const eventsSplit = splitBody(exp.eventsCsv, PER_PATIENT_EVENTS_HEADER);
    const timelineSplit = splitBody(exp.timelineCsv, PER_PATIENT_TIMELINE_HEADER);

    const decoratedEvents = prependPatientColumns(
      eventsSplit.bodyLines,
      slice.patientId,
      slice.patientName,
    );
    const decoratedTimeline = prependPatientColumns(
      timelineSplit.bodyLines,
      slice.patientId,
      slice.patientName,
    );

    for (const line of decoratedEvents) eventsBody.push(line);
    for (const line of decoratedTimeline) timelineBody.push(line);

    perPatientEventRowCounts[slice.patientId] = decoratedEvents.length;
    perPatientTimelineRowCounts[slice.patientId] = decoratedTimeline.length;
    patientIds.push(slice.patientId);
  }

  const eventsCsv =
    prefix +
    [MERGED_EVENTS_HEADER, ...eventsBody].join(LF) +
    LF;
  const timelineCsv =
    prefix +
    [MERGED_TIMELINE_HEADER, ...timelineBody].join(LF) +
    LF;

  return {
    eventsCsv,
    timelineCsv,
    eventRowCount: eventsBody.length,
    timelineRowCount: timelineBody.length,
    perPatientEventRowCounts,
    perPatientTimelineRowCounts,
    patientIds,
  };
}

/**
 * Convenience: merge directly from rollups, skipping the
 * intermediate per-patient export objects.
 */
export function mergeRegimenHistoryRollupCsvExportsFromRollups(
  rollups: { patientId: string; patientName: string; rollup: RegimenHistoryRollup }[],
  options: RegimenHistoryCsvMergeOptions = {},
): RegimenHistoryCsvMergeResult {
  return mergeRegimenHistoryRollupCsvExports(
    rollups.map((r) => ({ patientId: r.patientId, patientName: r.patientName, rollup: r.rollup })),
    options,
  );
}

/**
 * Convenience: events-only merge (drops the timeline). Useful for
 * the per-class drill-down workflow that doesn't need regimen-size
 * plotting.
 */
export function mergeRegimenHistoryEventsCsvOnly(
  slices: RegimenHistoryCsvMergeInput[],
  options: RegimenHistoryCsvMergeOptions = {},
): string {
  return mergeRegimenHistoryRollupCsvExports(slices, options).eventsCsv;
}

/**
 * Convenience: timeline-only merge — multi-patient regimen-size
 * plot for the analytics tooling.
 */
export function mergeRegimenHistoryTimelineCsvOnly(
  slices: RegimenHistoryCsvMergeInput[],
  options: RegimenHistoryCsvMergeOptions = {},
): string {
  return mergeRegimenHistoryRollupCsvExports(slices, options).timelineCsv;
}
