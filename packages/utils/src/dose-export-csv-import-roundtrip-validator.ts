/**
 * Dose export CSV import round-trip validator.
 *
 * `dose-export-csv` ships a CSV export (MED_TRACKER layout) and a
 * companion `parseDoseCsvExport` that round-trips it back to Dose[].
 * Three realistic things happen to that CSV between export and
 * re-import:
 *
 *   1. The patient opens the CSV in Excel-on-Windows, adjusts a few
 *      taken_at / status / note cells (added details after the fact),
 *      and re-uploads.
 *   2. A caregiver copies the CSV into a shared spreadsheet, sorts
 *      it, and exports back — Excel will silently re-format some
 *      datetimes, drop note cells with leading apostrophes, and
 *      insert a BOM.
 *   3. A pharmacy round-trip strips the scheduleId column and writes
 *      back its own — the row identity is preserved by dose_id but
 *      the schedule reference may no longer match.
 *
 * We DO NOT want to silently blast those edited rows over the
 * source-of-truth Dose store. The right behaviour is to compute a
 * per-field difference report so the UI can present "the following
 * rows have changed since you last exported them — accept which
 * ones?". This module is that validator.
 *
 * Given an original Dose[] and a re-imported CSV string, it produces:
 *   - `parsedDoses`: the Dose[] from parseDoseCsvExport.
 *   - `parseSkipped`: the parser's skipped row list.
 *   - `diffs`: per-dose field-level changes (status, takenAt,
 *     scheduleId, note).
 *   - `addedIds` / `removedIds`: dose ids that appeared / disappeared.
 *   - `unchangedCount`: rows that round-tripped byte-for-byte.
 *
 * The diff is field-grained because a row that changed ONLY note is
 * a low-risk patient annotation that can be accepted automatically;
 * a row that changed scheduleId is a structural change that needs
 * adjudication.
 *
 * Pure / deterministic. No I/O.
 */

import type { Dose } from '@med/types';
import {
  parseDoseCsvExport,
  type DoseCsvParseResult,
} from './dose-export-csv';

/** Field whose value diverged between source and re-imported row. */
export type DoseRoundtripField =
  | 'status'
  | 'takenAt'
  | 'scheduleId'
  | 'medicationId'
  | 'dueAt'
  | 'note';

export interface DoseRoundtripFieldChange {
  field: DoseRoundtripField;
  /** Source value (from the original Dose). */
  before: string | null;
  /** Re-imported value. */
  after: string | null;
}

export interface DoseRoundtripDiff {
  doseId: string;
  changes: DoseRoundtripFieldChange[];
  /**
   * Risk tier the UI can map to a chip color without re-parsing the
   * field list:
   *   'note-only'    - only the note cell diverged. Low risk.
   *   'status-edit'  - status flipped (and maybe takenAt). Patient is
   *                    re-asserting actual adherence; medium risk.
   *   'structural'   - scheduleId / medicationId / dueAt diverged.
   *                    High risk — pharmacy round-trips drop these.
   *   'mixed'        - multiple categories. Treat as structural for
   *                    accept-all decisions.
   */
  risk: 'note-only' | 'status-edit' | 'structural' | 'mixed';
}

export interface DoseRoundtripValidateResult {
  parsedDoses: Dose[];
  parseSkipped: DoseCsvParseResult['skipped'];
  diffs: DoseRoundtripDiff[];
  addedIds: string[];
  removedIds: string[];
  unchangedCount: number;
}

const STATUS_FIELD: DoseRoundtripField = 'status';
const TAKEN_FIELD: DoseRoundtripField = 'takenAt';
const NOTE_FIELD: DoseRoundtripField = 'note';
const STRUCTURAL_FIELDS: ReadonlySet<DoseRoundtripField> = new Set([
  'scheduleId',
  'medicationId',
  'dueAt',
]);

function normalisedTakenAt(d: Dose): string | null {
  return d.takenAt ?? null;
}

function normalisedNote(d: Dose): string | null {
  // Treat empty-string note and missing-note as the same value — the
  // CSV writer emits an empty cell for both and the parser converts
  // back to undefined. Keeping them distinct would produce spurious
  // diffs on every round-trip.
  const note = (d as Dose & { note?: string }).note;
  if (note === undefined) return null;
  const trimmed = note.trim();
  return trimmed === '' ? null : trimmed;
}

function compareDose(before: Dose, after: Dose): DoseRoundtripDiff | null {
  const changes: DoseRoundtripFieldChange[] = [];
  if (before.status !== after.status) {
    changes.push({ field: STATUS_FIELD, before: before.status, after: after.status });
  }
  const beforeTaken = normalisedTakenAt(before);
  const afterTaken = normalisedTakenAt(after);
  if (beforeTaken !== afterTaken) {
    changes.push({ field: TAKEN_FIELD, before: beforeTaken, after: afterTaken });
  }
  if (before.scheduleId !== after.scheduleId) {
    changes.push({ field: 'scheduleId', before: before.scheduleId, after: after.scheduleId });
  }
  if (before.medicationId !== after.medicationId) {
    changes.push({
      field: 'medicationId',
      before: before.medicationId,
      after: after.medicationId,
    });
  }
  if (before.dueAt !== after.dueAt) {
    changes.push({ field: 'dueAt', before: before.dueAt, after: after.dueAt });
  }
  const beforeNote = normalisedNote(before);
  const afterNote = normalisedNote(after);
  if (beforeNote !== afterNote) {
    changes.push({ field: NOTE_FIELD, before: beforeNote, after: afterNote });
  }
  if (changes.length === 0) return null;
  return {
    doseId: before.id,
    changes,
    risk: classifyRisk(changes),
  };
}

function classifyRisk(
  changes: DoseRoundtripFieldChange[],
): DoseRoundtripDiff['risk'] {
  const fields = new Set(changes.map((c) => c.field));
  const hasStructural = [...fields].some((f) => STRUCTURAL_FIELDS.has(f));
  const hasStatusOrTaken = fields.has(STATUS_FIELD) || fields.has(TAKEN_FIELD);
  const hasNote = fields.has(NOTE_FIELD);

  if (hasStructural && (hasStatusOrTaken || hasNote)) return 'mixed';
  if (hasStatusOrTaken && hasNote) return 'mixed';
  if (hasStructural) return 'structural';
  if (hasStatusOrTaken) return 'status-edit';
  if (hasNote) return 'note-only';
  return 'mixed';
}

/**
 * Validate a re-imported MED_TRACKER-layout CSV against the original
 * Dose[]. Produces per-row diffs (field-grained), an added/removed
 * set, and the parser's own skip list. The caller decides whether to
 * apply, reject, or queue each diff for manual review.
 *
 * Match key is `Dose.id`. Diffs are emitted only when at least one
 * tracked field diverges; identical rows are counted in
 * `unchangedCount` so the UI can show "42 rows unchanged".
 */
export function validateDoseCsvRoundtrip(
  source: Dose[],
  csv: string,
): DoseRoundtripValidateResult {
  const parsed = parseDoseCsvExport(csv);
  const sourceById = new Map<string, Dose>();
  for (const d of source) sourceById.set(d.id, d);

  const parsedById = new Map<string, Dose>();
  for (const d of parsed.doses) parsedById.set(d.id, d);

  const diffs: DoseRoundtripDiff[] = [];
  const removedIds: string[] = [];
  const addedIds: string[] = [];
  let unchangedCount = 0;

  for (const [id, src] of sourceById.entries()) {
    const reimported = parsedById.get(id);
    if (!reimported) {
      removedIds.push(id);
      continue;
    }
    const diff = compareDose(src, reimported);
    if (diff) diffs.push(diff);
    else unchangedCount += 1;
  }
  for (const [id] of parsedById.entries()) {
    if (!sourceById.has(id)) addedIds.push(id);
  }

  diffs.sort((a, b) => a.doseId.localeCompare(b.doseId));
  removedIds.sort();
  addedIds.sort();

  return {
    parsedDoses: parsed.doses,
    parseSkipped: parsed.skipped,
    diffs,
    addedIds,
    removedIds,
    unchangedCount,
  };
}

/**
 * Convenience: filter diffs by risk tier. Useful for the UI's
 * "auto-accept note-only changes" toggle — bulk-accept the safe
 * tier without surfacing them to the patient.
 */
export function filterDiffsByRisk(
  diffs: DoseRoundtripDiff[],
  risks: DoseRoundtripDiff['risk'] | DoseRoundtripDiff['risk'][],
): DoseRoundtripDiff[] {
  const wanted = new Set(Array.isArray(risks) ? risks : [risks]);
  return diffs.filter((d) => wanted.has(d.risk));
}

/**
 * Apply a subset of diffs onto the source Dose[] and return a NEW
 * Dose[] (no mutation). Each diff replaces the matching source row
 * with the re-imported row from parsedDoses. Diffs whose doseId is
 * not in `source` are ignored — this function never adds rows.
 *
 * Caller-side use: after the patient adjudicates diffs in the UI,
 * pass the accepted subset here to compute the post-merge Dose[].
 */
export function applyAcceptedDiffs(
  source: Dose[],
  result: DoseRoundtripValidateResult,
  acceptedDoseIds: Iterable<string>,
): Dose[] {
  const acceptedSet = new Set(acceptedDoseIds);
  const parsedById = new Map(result.parsedDoses.map((d) => [d.id, d]));
  return source.map((src) => {
    if (!acceptedSet.has(src.id)) return src;
    const reimported = parsedById.get(src.id);
    return reimported ?? src;
  });
}

/**
 * Summary one-liner suitable for a cron log or a toast confirmation.
 * Example:
 *   "Round-trip: 42 unchanged, 5 diffs (1 structural, 2 status-edit,
 *    2 note-only), 0 added, 1 removed, 0 parser skips."
 */
export function summarizeRoundtripResult(
  result: DoseRoundtripValidateResult,
): string {
  const counts: Record<DoseRoundtripDiff['risk'], number> = {
    'note-only': 0,
    'status-edit': 0,
    structural: 0,
    mixed: 0,
  };
  for (const d of result.diffs) counts[d.risk] += 1;
  const parts: string[] = [];
  if (counts.structural > 0) parts.push(`${counts.structural} structural`);
  if (counts['status-edit'] > 0) parts.push(`${counts['status-edit']} status-edit`);
  if (counts['note-only'] > 0) parts.push(`${counts['note-only']} note-only`);
  if (counts.mixed > 0) parts.push(`${counts.mixed} mixed`);
  const diffsLabel = parts.length === 0 ? '0 diffs' : `${result.diffs.length} diffs (${parts.join(', ')})`;
  return (
    `Round-trip: ${result.unchangedCount} unchanged, ${diffsLabel}, ` +
    `${result.addedIds.length} added, ${result.removedIds.length} removed, ` +
    `${result.parseSkipped.length} parser skip${result.parseSkipped.length === 1 ? '' : 's'}.`
  );
}
