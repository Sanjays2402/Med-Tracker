/**
 * Medication history CSV import with dedup.
 *
 * Patients move between apps and clinics. The Apple Health / Google
 * Fit / pharmacy / old-tracker exports they bring with them are
 * always CSV, but never the same CSV: column names differ, status
 * vocabulary differs (taken / takenAt / TakenTime / "Yes"), and the
 * same dose often appears twice (one from the pharmacy log, one
 * from the patient's manual entry).
 *
 * This module:
 *
 *   - parses a flexible CSV with a column-name mapping table so a
 *     user can pick "Medication" -> medicationId, "When" -> dueAt,
 *     "Taken at" -> takenAt etc. without rewriting the file,
 *   - normalises status strings into the canonical DoseHistoryEntry
 *     status (taken / skipped / null) used by dose-history-aggregator,
 *   - dedupes near-duplicate rows (same medication + dueAt within a
 *     configurable tolerance, default 5 minutes),
 *   - reports per-row outcomes (imported / duplicate / invalid) so
 *     the UI can show a "Imported 132, skipped 9 duplicates, 3
 *     invalid rows" summary,
 *   - never silently drops malformed rows.
 *
 * Pure / deterministic.
 */

import type { DoseHistoryEntry } from './dose-history-aggregator';

export interface ImportColumnMap {
  /** Header name for the due date. Required. */
  dueAt: string;
  /** Header name for the taken-at timestamp. Optional. */
  takenAt?: string;
  /** Header name for status (taken, skipped, missed). Optional. */
  status?: string;
  /** Header name for the medication identifier. Required. */
  medicationId: string;
}

export interface ImportOptions {
  columns: ImportColumnMap;
  /**
   * Dedup tolerance in minutes. Two rows with the same medicationId
   * and dueAt within this window are merged (the later row's takenAt
   * is preferred when present). Default 5.
   */
  dedupMinutes?: number;
  /** Treat the first row as headers. Default true. */
  hasHeader?: boolean;
  /** Cell value(s) parsed as "taken". Case-insensitive. */
  takenVocab?: string[];
  /** Cell value(s) parsed as "skipped". Case-insensitive. */
  skippedVocab?: string[];
}

export type RowOutcome = 'imported' | 'duplicate' | 'invalid';

export interface RowReport {
  rowIndex: number;
  outcome: RowOutcome;
  reason?: string;
  entry?: DoseHistoryEntry;
}

export interface ImportResult {
  entries: DoseHistoryEntry[];
  reports: RowReport[];
  counts: Record<RowOutcome, number>;
}

const DEFAULT_TAKEN_VOCAB = ['taken', 'yes', 'y', 'true', '1', 'completed', 'done'];
const DEFAULT_SKIPPED_VOCAB = ['skipped', 'skip', 'no', 'n', 'false', '0', 'declined'];

/**
 * Minimal CSV parser that handles quoted cells, escaped quotes, and
 * embedded newlines. Sufficient for typical pharmacy/clinic exports.
 * Returns rows of string cells.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  // Trailing cell / row (no newline at EOF).
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normaliseTimestamp(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function findDuplicateIndex(
  perMed: Map<string, Array<{ ms: number; index: number }>>,
  medicationId: string,
  dueAtMs: number,
  toleranceMs: number,
): number | null {
  const list = perMed.get(medicationId);
  if (!list) return null;
  for (const item of list) {
    if (Math.abs(item.ms - dueAtMs) <= toleranceMs) return item.index;
  }
  return null;
}

function statusFromCell(
  raw: string | undefined,
  takenVocab: string[],
  skippedVocab: string[],
): { takenAt?: string | null; skipped?: boolean } {
  if (!raw) return {};
  const v = raw.trim().toLowerCase();
  if (!v) return {};
  if (takenVocab.includes(v)) return { takenAt: undefined }; // unknown when, but explicit taken
  if (skippedVocab.includes(v)) return { skipped: true };
  return {};
}

/**
 * Import a CSV blob into DoseHistoryEntry records, with dedup and
 * per-row reporting.
 */
export function importMedicationHistory(
  csv: string,
  options: ImportOptions,
): ImportResult {
  const hasHeader = options.hasHeader ?? true;
  const dedupMs = (options.dedupMinutes ?? 5) * 60_000;
  const takenVocab = (options.takenVocab ?? DEFAULT_TAKEN_VOCAB).map((s) => s.toLowerCase());
  const skippedVocab = (options.skippedVocab ?? DEFAULT_SKIPPED_VOCAB).map((s) => s.toLowerCase());

  const allRows = parseCsv(csv).filter((row) => row.some((c) => c.trim().length > 0));
  if (allRows.length === 0) {
    return { entries: [], reports: [], counts: { imported: 0, duplicate: 0, invalid: 0 } };
  }

  let headers: string[] = [];
  let dataRows: string[][] = allRows;
  if (hasHeader) {
    headers = allRows[0]!.map((c) => c.trim());
    dataRows = allRows.slice(1);
  } else {
    // Without a header, expect the column map to use index strings
    // like "0", "1". We synthesize headers as the indices.
    headers = allRows[0]!.map((_, i) => String(i));
  }

  const colIdx = (name: string): number => headers.indexOf(name);
  const dueIdx = colIdx(options.columns.dueAt);
  const medIdx = colIdx(options.columns.medicationId);
  const takenIdx = options.columns.takenAt ? colIdx(options.columns.takenAt) : -1;
  const statusIdx = options.columns.status ? colIdx(options.columns.status) : -1;

  const perMed = new Map<string, Array<{ ms: number; index: number }>>();
  const entries: DoseHistoryEntry[] = [];
  const reports: RowReport[] = [];
  const counts: Record<RowOutcome, number> = { imported: 0, duplicate: 0, invalid: 0 };

  if (dueIdx < 0 || medIdx < 0) {
    return {
      entries: [],
      reports: dataRows.map((_, i) => ({
        rowIndex: i + (hasHeader ? 1 : 0),
        outcome: 'invalid' as const,
        reason: 'required columns dueAt and medicationId not found in header',
      })),
      counts: { imported: 0, duplicate: 0, invalid: dataRows.length },
    };
  }

  dataRows.forEach((row, i) => {
    const rowIndex = i + (hasHeader ? 1 : 0);
    const med = row[medIdx]?.trim();
    const dueRaw = row[dueIdx]?.trim();
    if (!med || !dueRaw) {
      reports.push({
        rowIndex,
        outcome: 'invalid',
        reason: 'missing medicationId or dueAt',
      });
      counts.invalid += 1;
      return;
    }
    const dueAt = normaliseTimestamp(dueRaw);
    if (!dueAt) {
      reports.push({
        rowIndex,
        outcome: 'invalid',
        reason: `unparseable dueAt value "${dueRaw}"`,
      });
      counts.invalid += 1;
      return;
    }
    const takenRaw = takenIdx >= 0 ? row[takenIdx]?.trim() ?? '' : '';
    const statusRaw = statusIdx >= 0 ? row[statusIdx]?.trim() ?? '' : '';

    const takenAt = takenRaw ? normaliseTimestamp(takenRaw) : null;

    let skipped = false;
    let finalTakenAt: string | null | undefined = takenAt;
    if (statusRaw) {
      const s = statusFromCell(statusRaw, takenVocab, skippedVocab);
      if (s.skipped) {
        skipped = true;
        finalTakenAt = null;
      } else if (s.takenAt === undefined && !takenRaw) {
        // status says "taken" but no timestamp given; fall back to dueAt.
        finalTakenAt = dueAt;
      }
    }

    const entry: DoseHistoryEntry = {
      dueAt,
      takenAt: finalTakenAt,
      medicationId: med,
    };
    if (skipped) entry.skipped = true;

    const key = med;
    const dueMs = new Date(dueAt).getTime();
    const existingIdx = findDuplicateIndex(perMed, key, dueMs, dedupMs);
    if (existingIdx !== null) {
      // Merge: prefer rows that have a takenAt. If both have takenAt,
      // pick the later (latest update wins).
      const existing = entries[existingIdx]!;
      if (entry.takenAt && (!existing.takenAt || (existing.takenAt && new Date(entry.takenAt).getTime() > new Date(existing.takenAt).getTime()))) {
        existing.takenAt = entry.takenAt;
      }
      if (entry.skipped && !existing.skipped) existing.skipped = true;
      reports.push({ rowIndex, outcome: 'duplicate', entry: existing });
      counts.duplicate += 1;
      return;
    }
    const newIndex = entries.length;
    const bucket = perMed.get(key) ?? [];
    bucket.push({ ms: dueMs, index: newIndex });
    perMed.set(key, bucket);
    entries.push(entry);
    reports.push({ rowIndex, outcome: 'imported', entry });
    counts.imported += 1;
  });

  return { entries, reports, counts };
}

/**
 * Convenience: validate a column map against a CSV header row before
 * starting the import. Returns the missing required headers if any.
 */
export function validateColumnMap(
  csv: string,
  columns: ImportColumnMap,
): { ok: boolean; missing: string[]; headers: string[] } {
  const rows = parseCsv(csv);
  const headers = (rows[0] ?? []).map((c) => c.trim());
  const required = [columns.dueAt, columns.medicationId];
  const optional = [columns.takenAt, columns.status].filter(
    (h): h is string => typeof h === 'string',
  );
  const missing: string[] = [];
  for (const r of required) if (!headers.includes(r)) missing.push(r);
  for (const o of optional) if (!headers.includes(o)) missing.push(o);
  return { ok: missing.length === 0, missing, headers };
}
