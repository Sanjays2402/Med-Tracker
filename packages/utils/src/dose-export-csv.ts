/**
 * Dose export CSV.
 *
 * `dose-batch-export` produces FHIR R4 MedicationAdministration JSON
 * for clinical interop. That's the right shape for an EHR import or
 * a clinician-to-clinician transfer. It is the WRONG shape for two
 * other very common consumers:
 *
 *   1. Retail-pharmacy systems (Walgreens, CVS, Kroger) that export
 *      dose-administration history as CSV. A patient who's been
 *      filling at one chain for years and wants to move to another
 *      is asked to bring their history — and the receiving pharmacy
 *      will only accept it as CSV.
 *   2. Spreadsheet-pivoting caregivers / family doctors who want to
 *      read the dose log directly in Excel / Numbers / Sheets
 *      without learning FHIR.
 *
 * This module is the CSV companion to dose-batch-export, sharing the
 * same date-range filtering, includeScheduled flag, and
 * Medication + Dose input shapes so a caller can ship FHIR JSON to
 * one consumer and CSV to another from a single export call.
 *
 * Two column layouts are supported:
 *   - `MED_TRACKER` (default): the full schema; round-trippable.
 *   - `WALGREENS` / `CVS`: subset matching the published columns of
 *     each chain's patient-history download. Field omission rather
 *     than empty-string for missing values keeps the CSV exactly
 *     diff-compatible with the chain's own exports.
 *
 * Pure / deterministic. No I/O.
 */

import type { Dose, DoseStatus, Medication } from '@med/types';

export type DoseCsvLayout = 'MED_TRACKER' | 'WALGREENS' | 'CVS';

/**
 * Status mapping for pharmacy CSV consumers. Pharmacy systems do not
 * have FHIR's full vocabulary — they store administration outcomes
 * as plain-English labels matching the chain's report. The mappings
 * mirror what the chains actually emit; do NOT widen them without
 * round-trip testing against a sample export from that chain.
 */
const PHARMACY_STATUS: Record<DoseStatus, string> = {
  taken: 'TAKEN',
  late: 'TAKEN-LATE',
  skipped: 'SKIPPED',
  missed: 'MISSED',
  scheduled: 'PENDING',
};

const MED_TRACKER_STATUS: Record<DoseStatus, string> = {
  taken: 'taken',
  late: 'late',
  skipped: 'skipped',
  missed: 'missed',
  scheduled: 'scheduled',
};

const MED_TRACKER_COLUMNS = [
  'dose_id',
  'medication_id',
  'medication_name',
  'medication_strength',
  'medication_form',
  'schedule_id',
  'due_at',
  'taken_at',
  'status',
  'note',
] as const;

// Walgreens published patient-history export columns (subset). The
// chain uses snake-case with a few brand-specific names — `member_id`
// for patient, `rx_number` for the prescription. We do not have
// rx_number in our schema; emitted as a blank.
const WALGREENS_COLUMNS = [
  'member_id',
  'rx_number',
  'drug_name',
  'strength',
  'dosage_form',
  'due_datetime',
  'taken_datetime',
  'outcome',
  'notes',
] as const;

// CVS exports use camelCase headers and prefix "Caremark" because
// some downloads are for Caremark members only. Patient column is
// `patientId`.
const CVS_COLUMNS = [
  'patientId',
  'prescriptionId',
  'drugName',
  'strength',
  'form',
  'scheduledDateTime',
  'administeredDateTime',
  'status',
  'notes',
] as const;

const HEADERS_BY_LAYOUT: Record<DoseCsvLayout, readonly string[]> = {
  MED_TRACKER: MED_TRACKER_COLUMNS,
  WALGREENS: WALGREENS_COLUMNS,
  CVS: CVS_COLUMNS,
};

export interface DoseCsvExportOptions {
  /** Which CSV layout to emit. Default 'MED_TRACKER'. */
  layout?: DoseCsvLayout;
  /** Inclusive ISO datetime range start. Defaults to no lower bound. */
  rangeStart?: string;
  /** Inclusive ISO datetime range end. Defaults to no upper bound. */
  rangeEnd?: string;
  /**
   * Include doses still in 'scheduled' status. Default false — like
   * dose-batch-export, exports normally ship realised history.
   */
  includeScheduled?: boolean;
  /** Member / patient id to embed in pharmacy layouts. Defaults to input.userId. */
  memberId?: string;
  /**
   * Optional rx-number lookup: when present, the function calls it
   * with the medicationId to populate the chain-specific
   * rx_number / prescriptionId column. Returning null/undefined
   * leaves the cell blank.
   */
  resolveRxNumber?: (medicationId: string) => string | null | undefined;
  /**
   * Line separator. Defaults to '\r\n' (CSV standard / Excel-friendly).
   * Pass '\n' for unix-style.
   */
  lineSeparator?: '\n' | '\r\n';
  /**
   * When true, prefix the output with a UTF-8 BOM so Excel on Windows
   * opens the file in UTF-8 by default. Default false — most non-Excel
   * consumers reject the BOM, so it's opt-in.
   */
  bom?: boolean;
}

export interface DoseCsvExportInput {
  userId: string;
  medications: Medication[];
  doses: Dose[];
  options?: DoseCsvExportOptions;
}

export interface DoseCsvExportResult {
  csv: string;
  /** Number of dose rows in the body (excluding header). */
  rowCount: number;
  /** Number of doses dropped because no matching medication. */
  skippedMissingMedication: number;
  /** Number of doses dropped by the range filter. */
  skippedOutOfRange: number;
  /** Number of 'scheduled' doses dropped because includeScheduled=false. */
  skippedScheduled: number;
  /** The layout actually used. */
  layout: DoseCsvLayout;
  /** Columns actually emitted. */
  columns: string[];
}

function pickEffective(dose: Dose): string {
  return dose.takenAt ?? dose.dueAt;
}

function inRange(ts: string, start: string | undefined, end: string | undefined): boolean {
  if (!start && !end) return true;
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  if (start) {
    const s = Date.parse(start);
    if (Number.isFinite(s) && t < s) return false;
  }
  if (end) {
    const e = Date.parse(end);
    if (Number.isFinite(e) && t > e) return false;
  }
  return true;
}

function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  // Empty string -> empty cell (no quoting).
  if (value === '') return '';
  // Quote when the field contains a quote, comma, CR, or LF. Double
  // any internal quotes per RFC 4180.
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function rowFor(
  dose: Dose,
  med: Medication,
  layout: DoseCsvLayout,
  memberId: string,
  resolveRx?: (medicationId: string) => string | null | undefined,
): string[] {
  const rxNumber = resolveRx ? (resolveRx(dose.medicationId) ?? '') : '';
  const note = dose.note ?? '';
  const due = dose.dueAt;
  const taken = dose.takenAt ?? '';
  switch (layout) {
    case 'MED_TRACKER':
      return [
        dose.id,
        med.id,
        med.name,
        med.strength ?? '',
        med.form,
        dose.scheduleId,
        due,
        taken,
        MED_TRACKER_STATUS[dose.status],
        note,
      ];
    case 'WALGREENS':
      return [
        memberId,
        rxNumber,
        med.name,
        med.strength ?? '',
        med.form,
        due,
        taken,
        PHARMACY_STATUS[dose.status],
        note,
      ];
    case 'CVS':
      return [
        memberId,
        rxNumber,
        med.name,
        med.strength ?? '',
        med.form,
        due,
        taken,
        PHARMACY_STATUS[dose.status],
        note,
      ];
  }
}

/**
 * Build a CSV string of dose events suitable for retail-pharmacy
 * round-trip OR spreadsheet inspection. Doses with no matching
 * medication are skipped (counted). Doses outside the (optional)
 * date range are skipped (counted). Scheduled doses are skipped
 * unless includeScheduled=true (counted).
 *
 * Output is sorted by effective datetime ascending (then by dose id)
 * for stable diffable CSVs across re-runs.
 */
export function buildDoseCsvExport(input: DoseCsvExportInput): DoseCsvExportResult {
  const options = input.options ?? {};
  const layout = options.layout ?? 'MED_TRACKER';
  const includeScheduled = options.includeScheduled ?? false;
  const memberId = options.memberId ?? input.userId;
  const lineSep = options.lineSeparator ?? '\r\n';
  const resolveRx = options.resolveRxNumber;

  const medsById = new Map<string, Medication>();
  for (const m of input.medications) medsById.set(m.id, m);

  type Row = { effective: string; doseId: string; cells: string[] };
  const rows: Row[] = [];
  let skippedMissingMedication = 0;
  let skippedOutOfRange = 0;
  let skippedScheduled = 0;
  for (const d of input.doses) {
    if (!includeScheduled && d.status === 'scheduled') {
      skippedScheduled += 1;
      continue;
    }
    const med = medsById.get(d.medicationId);
    if (!med) {
      skippedMissingMedication += 1;
      continue;
    }
    const effective = pickEffective(d);
    if (!inRange(effective, options.rangeStart, options.rangeEnd)) {
      skippedOutOfRange += 1;
      continue;
    }
    rows.push({
      effective,
      doseId: d.id,
      cells: rowFor(d, med, layout, memberId, resolveRx),
    });
  }

  rows.sort((a, b) => {
    if (a.effective < b.effective) return -1;
    if (a.effective > b.effective) return 1;
    return a.doseId.localeCompare(b.doseId);
  });

  const columns = [...HEADERS_BY_LAYOUT[layout]];
  const headerLine = columns.map(csvCell).join(',');
  const bodyLines = rows.map((r) => r.cells.map(csvCell).join(','));
  const blocks: string[] = [headerLine, ...bodyLines];
  let csv = blocks.join(lineSep) + lineSep;
  if (options.bom) csv = '\uFEFF' + csv;

  return {
    csv,
    rowCount: rows.length,
    skippedMissingMedication,
    skippedOutOfRange,
    skippedScheduled,
    layout,
    columns,
  };
}

/**
 * Parse a Med-Tracker layout CSV back into Dose + medication-id
 * lookup pairs. ROUND-TRIP COMPANION for `buildDoseCsvExport` with
 * layout='MED_TRACKER': the chain layouts are lossy (no scheduleId,
 * no dose_id) and cannot round-trip; only the native layout can.
 *
 * Rows whose status is not a known DoseStatus are dropped and
 * counted. Empty taken_at and note cells become undefined / null
 * exactly the way the original Dose carried them. Header row order
 * is flexible (we look up by column name) — bring-your-own-CSV from
 * a hand-edited file still parses provided headers match.
 */
export interface DoseCsvParseResult {
  doses: Dose[];
  skipped: { row: number; reason: string }[];
}

export function parseDoseCsvExport(csv: string): DoseCsvParseResult {
  const doses: Dose[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const stripped = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const records = parseCsv(stripped);
  if (records.length === 0) return { doses, skipped };
  const header = records[0]!;
  const idx: Record<string, number> = {};
  header.forEach((col, i) => {
    idx[col.trim()] = i;
  });
  const required = ['dose_id', 'medication_id', 'schedule_id', 'due_at', 'status'];
  for (const r of required) {
    if (idx[r] === undefined) {
      skipped.push({ row: 0, reason: `missing-column:${r}` });
      return { doses, skipped };
    }
  }
  for (let row = 1; row < records.length; row++) {
    const rec = records[row]!;
    if (rec.length === 1 && rec[0]!.trim() === '') continue;
    const status = rec[idx['status']!]!.trim() as DoseStatus;
    if (!isDoseStatus(status)) {
      skipped.push({ row, reason: `invalid-status:${status}` });
      continue;
    }
    const dose: Dose = {
      id: rec[idx['dose_id']!]!,
      medicationId: rec[idx['medication_id']!]!,
      scheduleId: rec[idx['schedule_id']!]!,
      dueAt: rec[idx['due_at']!]!,
      takenAt: trimToNull(rec[idx['taken_at']!]),
      status,
    } as Dose;
    const noteIdx = idx['note'];
    if (noteIdx !== undefined) {
      const note = trimToUndef(rec[noteIdx]);
      if (note !== undefined) (dose as Dose & { note?: string }).note = note;
    }
    doses.push(dose);
  }
  return { doses, skipped };
}

function isDoseStatus(s: string): s is DoseStatus {
  return s === 'taken' || s === 'late' || s === 'skipped' || s === 'missed' || s === 'scheduled';
}

function trimToNull(s: string | undefined): string | null {
  if (s === undefined) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

function trimToUndef(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t === '' ? undefined : t;
}

/**
 * Minimal RFC-4180-flavoured CSV parser. Handles quoted cells,
 * doubled quotes inside quoted cells, and CRLF/LF line endings. We
 * don't depend on a 3rd-party parser because the chain CSVs we
 * round-trip are well-formed and adding a dep would inflate the
 * package surface for one consumer.
 */
function parseCsv(input: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < input.length) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r' && input[i + 1] === '\n') {
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      i += 2;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Trailing cell / row when input didn't end with a newline.
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out;
}
