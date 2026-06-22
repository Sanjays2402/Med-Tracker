/**
 * Regimen snapshot archive history rollup — CSV export.
 *
 * `regimen-snapshot-archive-history-rollup` produces a
 * RegimenHistoryRollup with per-medication chronological events
 * (added / removed / strength-change) plus a snapshot-by-snapshot
 * timeline. The HTML render is for in-portal review; for sharing with
 * clinicians who don't have Med-Tracker access (a second-opinion
 * cardiologist, the patient's primary-care office, a discharge
 * planner pulling records into their own EHR), we need a CSV the
 * recipient can open in Excel / Numbers / Google Sheets without any
 * intermediate parser.
 *
 * Two CSV exports cover the realistic ask:
 *
 *   1. `eventsCsv` — one row per event. Columns: snapshotId, takenAt,
 *      medicationId, medicationName, kind, before, after. The
 *      receiving clinician filters / sorts in their spreadsheet. The
 *      row order matches the rollup's perMedication order with
 *      events chronological-ascending inside each medication.
 *
 *   2. `timelineCsv` — one row per snapshot. Columns: snapshotId,
 *      takenAt, itemCount, delta. Useful for plotting regimen-size
 *      over time in the receiving clinician's analytics tool.
 *
 * MED_TRACKER CSV conventions match `dose-export-csv`:
 *   - UTF-8 with optional BOM (opt-in via options.includeBom).
 *   - Header row always emitted, even for an empty body.
 *   - Empty / undefined fields are written as bare empty cells
 *     (`,,`) — NOT the literal string "null" — so spreadsheet
 *     formulas treat them as blank cells.
 *   - Cells containing comma, quote, or newline are RFC 4180 escaped.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  RegimenHistoryRollup,
  RegimenHistoryEvent,
  RegimenMedicationHistory,
  RegimenSnapshotTimelineEntry,
} from './regimen-snapshot-archive-history-rollup';

export interface RegimenHistoryCsvExportOptions {
  /** Prepend a UTF-8 BOM (\uFEFF) so Excel-on-Windows opens it as UTF-8. Default false. */
  includeBom?: boolean;
  /**
   * Row order for the eventsCsv body. Default 'medication' (preserves
   * the rollup's perMedication order with chronological events inside
   * each medication). 'time' returns a flat chronological list
   * regardless of medication.
   */
  eventOrder?: 'medication' | 'time';
}

export interface RegimenHistoryCsvExportResult {
  /** One row per event (added / removed / strength-change). */
  eventsCsv: string;
  /** One row per snapshot. */
  timelineCsv: string;
  /** Row count in eventsCsv body (excludes header). */
  eventRowCount: number;
  /** Row count in timelineCsv body (excludes header). */
  timelineRowCount: number;
}

const EVENTS_HEADER = [
  'snapshotId',
  'takenAt',
  'medicationId',
  'medicationName',
  'kind',
  'before',
  'after',
];

const TIMELINE_HEADER = ['snapshotId', 'takenAt', 'itemCount', 'delta'];

const BOM = '\uFEFF';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'number' ? String(value) : value;
  if (s === '') return '';
  // RFC 4180: a cell needs quoting if it contains comma, double-quote,
  // CR, or LF. Inside quotes, embedded double-quotes are doubled.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsvCell).join(',');
}

interface FlatEvent {
  snapshotId: string;
  takenAt: string;
  medicationId: string;
  medicationName: string;
  kind: RegimenHistoryEvent['kind'];
  before: string | null;
  after: string | null;
}

function flattenMedicationEvents(med: RegimenMedicationHistory): FlatEvent[] {
  return med.events.map((ev) => ({
    snapshotId: ev.snapshotId,
    takenAt: ev.observedAt,
    medicationId: med.medicationId,
    medicationName: med.name,
    kind: ev.kind,
    before: ev.before ?? null,
    after: ev.after ?? null,
  }));
}

function flattenAllEvents(rollup: RegimenHistoryRollup): FlatEvent[] {
  const out: FlatEvent[] = [];
  for (const med of rollup.perMedication) {
    for (const ev of flattenMedicationEvents(med)) out.push(ev);
  }
  return out;
}

function buildEventsCsv(
  rollup: RegimenHistoryRollup,
  order: 'medication' | 'time',
): { csv: string; rowCount: number } {
  const rows = flattenAllEvents(rollup);
  if (order === 'time') {
    rows.sort((a, b) => {
      const ta = Date.parse(a.takenAt);
      const tb = Date.parse(b.takenAt);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      // Stable secondary sort by snapshotId then medicationId so the
      // output is deterministic even for same-millisecond snapshots.
      if (a.snapshotId !== b.snapshotId) return a.snapshotId.localeCompare(b.snapshotId);
      return a.medicationId.localeCompare(b.medicationId);
    });
  }
  const header = EVENTS_HEADER.join(',');
  const body = rows.map((r) =>
    joinRow([
      r.snapshotId,
      r.takenAt,
      r.medicationId,
      r.medicationName,
      r.kind,
      r.before,
      r.after,
    ]),
  );
  const csv = [header, ...body].join('\n') + '\n';
  return { csv, rowCount: rows.length };
}

function buildTimelineCsv(rollup: RegimenHistoryRollup): { csv: string; rowCount: number } {
  const rows: RegimenSnapshotTimelineEntry[] = rollup.timeline;
  const header = TIMELINE_HEADER.join(',');
  const body = rows.map((r) =>
    joinRow([r.snapshotId, r.takenAt, r.itemCount, r.delta]),
  );
  const csv = [header, ...body].join('\n') + '\n';
  return { csv, rowCount: rows.length };
}

/**
 * Convert a RegimenHistoryRollup into two CSV strings suitable for
 * sharing with a non-Med-Tracker clinician. The eventsCsv is the
 * primary artefact (one row per regimen change); the timelineCsv is a
 * companion for plotting regimen size over time.
 *
 * Pure / deterministic. Empty rollups produce header-only CSVs (still
 * a valid spreadsheet open).
 */
export function exportRegimenHistoryRollupCsv(
  rollup: RegimenHistoryRollup,
  options: RegimenHistoryCsvExportOptions = {},
): RegimenHistoryCsvExportResult {
  const order = options.eventOrder ?? 'medication';
  const prefix = options.includeBom ? BOM : '';
  const events = buildEventsCsv(rollup, order);
  const timeline = buildTimelineCsv(rollup);
  return {
    eventsCsv: prefix + events.csv,
    timelineCsv: prefix + timeline.csv,
    eventRowCount: events.rowCount,
    timelineRowCount: timeline.rowCount,
  };
}

/**
 * Convenience: events-only export for callers that only need the
 * change log and don't care about regimen-size plotting.
 */
export function exportRegimenHistoryEventsCsv(
  rollup: RegimenHistoryRollup,
  options: RegimenHistoryCsvExportOptions = {},
): string {
  return exportRegimenHistoryRollupCsv(rollup, options).eventsCsv;
}

/**
 * Convenience: timeline-only export for callers that only want the
 * regimen-size-over-time series.
 */
export function exportRegimenHistoryTimelineCsv(
  rollup: RegimenHistoryRollup,
  options: RegimenHistoryCsvExportOptions = {},
): string {
  return exportRegimenHistoryRollupCsv(rollup, options).timelineCsv;
}

/**
 * Convenience: filter the rollup's events to a single medication
 * before exporting. Pass-through when medicationId is unknown
 * (produces a header-only CSV).
 */
export function exportRegimenHistoryEventsCsvForMedication(
  rollup: RegimenHistoryRollup,
  medicationId: string,
  options: RegimenHistoryCsvExportOptions = {},
): string {
  const med = rollup.perMedication.find((m) => m.medicationId === medicationId);
  const filtered: RegimenHistoryRollup = {
    ...rollup,
    perMedication: med ? [med] : [],
  };
  return exportRegimenHistoryEventsCsv(filtered, options);
}
