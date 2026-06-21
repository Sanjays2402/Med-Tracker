/**
 * Medication conflict resolver.
 *
 * In the real world the same prescription arrives from MULTIPLE
 * sources: the pharmacy's e-prescribing record (gold for strength,
 * dosesPerRefill, NDC), an EHR import (gold for the prescriber,
 * indication, instructions), and the patient's own manual entry
 * (gold for the brand name they recognize and personal notes). A
 * naive "last write wins" merge clobbers a curated EHR record with a
 * thin manual entry; a naive "first write wins" leaves a stale
 * brand name in place after a generic substitution.
 *
 * This module merges N source records for the same medication using
 * an explicit per-field precedence map. Each source declares its
 * provenance (`source`) and a recorded timestamp (`recordedAt`); the
 * resolver walks every mergeable field, picks the highest-priority
 * non-empty value, and surfaces a `manualReview` queue entry whenever
 * two equally-trusted sources disagree on a substantive field
 * (strength, dosesPerRefill, schedules) so a human can adjudicate.
 *
 * Empty values (undefined / '' / null) never displace a non-empty
 * value regardless of source priority — this is the right default
 * because an EHR import with a missing field shouldn't blank out a
 * value the pharmacy already filled in.
 *
 * Pure / deterministic. No I/O.
 */

import type { Medication } from '@med/types';

export type ConflictSource = 'pharmacy' | 'ehr' | 'manual' | 'caregiver' | 'import';

export interface MedicationRecord {
  /** Where this record came from. */
  source: ConflictSource;
  /** ISO timestamp the source generated / last touched this record. */
  recordedAt: string;
  /**
   * Partial medication payload. medicationId / drugId are used as the
   * merge key — every record in a group MUST share them.
   */
  medication: Partial<Medication>;
}

export type MedicationField = keyof Medication;

/**
 * Default precedence: pharmacy (NDC-level truth) > EHR (clinical
 * truth) > caregiver > manual > import. Higher index = higher
 * authority. The resolver inverts this internally.
 */
export const DEFAULT_PRECEDENCE: ConflictSource[] = [
  'import',
  'manual',
  'caregiver',
  'ehr',
  'pharmacy',
];

/**
 * Substantive fields where a disagreement between equally-trusted
 * sources warrants manual review (a typo on `name` is rarely actionable;
 * a typo on `strength` is patient-safety critical).
 */
export const SUBSTANTIVE_FIELDS: MedicationField[] = [
  'strength',
  'form',
  'dosesPerRefill',
  'startDate',
  'endDate',
  'active',
  'drugId',
];

export interface FieldChoice {
  field: MedicationField;
  value: unknown;
  /** Source whose value won the field. */
  source: ConflictSource;
  /** All competing values that were considered for this field. */
  candidates: { source: ConflictSource; value: unknown }[];
}

export interface ManualReviewEntry {
  field: MedicationField;
  /**
   * The conflicting candidate values, all at the SAME (highest)
   * precedence tier. The resolver picked one deterministically
   * (latest recordedAt then alphabetic source) but flagged it.
   */
  candidates: { source: ConflictSource; value: unknown; recordedAt: string }[];
  chosenSource: ConflictSource;
  reason: string;
}

export interface ResolveOptions {
  /**
   * Override per-field source precedence. Sources missing from a
   * field's list fall back to DEFAULT_PRECEDENCE.
   */
  fieldPrecedence?: Partial<Record<MedicationField, ConflictSource[]>>;
  /**
   * Globally override the source ranking. Lower-priority sources
   * appear earlier; higher-priority sources later (matches
   * DEFAULT_PRECEDENCE).
   */
  precedence?: ConflictSource[];
  /**
   * Extend / restrict the substantive field list. When undefined,
   * SUBSTANTIVE_FIELDS is used.
   */
  substantiveFields?: MedicationField[];
}

export interface ResolveResult {
  /** Merged medication payload, ready to feed back into the DB. */
  medication: Partial<Medication>;
  /** Field-by-field decisions for auditing. */
  fieldChoices: FieldChoice[];
  /** Conflicts a human should review (always empty when only one source). */
  manualReview: ManualReviewEntry[];
  /** Source records actually consulted for this merge. */
  sources: ConflictSource[];
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.length === 0;
  return false;
}

function valueKey(v: unknown): string {
  if (v === undefined || v === null) return '__nil__';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function rankMap(order: ConflictSource[]): Map<ConflictSource, number> {
  const m = new Map<ConflictSource, number>();
  order.forEach((s, i) => m.set(s, i));
  return m;
}

/**
 * Resolve a single field across the candidate records using a
 * precedence-aware pick: non-empty wins over empty; higher-priority
 * source wins; ties broken by most recent recordedAt then by
 * alphabetic source (deterministic).
 */
function chooseField(
  field: MedicationField,
  records: MedicationRecord[],
  precedence: ConflictSource[],
): FieldChoice {
  const ranks = rankMap(precedence);
  // Make sure unranked sources still get a deterministic rank below
  // any explicitly-ranked source.
  const rankOf = (s: ConflictSource): number => ranks.get(s) ?? -1;

  const candidates: { source: ConflictSource; value: unknown }[] = records.map((r) => ({
    source: r.source,
    value: (r.medication as Record<string, unknown>)[field],
  }));

  // Filter to non-empty candidates; if all are empty, pick the first
  // (still records the empty value for diagnostic purposes).
  const nonEmpty = records.filter((r) => !isEmpty((r.medication as Record<string, unknown>)[field]));
  if (nonEmpty.length === 0) {
    return {
      field,
      value: undefined,
      source: records[0]!.source,
      candidates,
    };
  }

  const best = [...nonEmpty].sort((a, b) => {
    const ra = rankOf(a.source);
    const rb = rankOf(b.source);
    if (ra !== rb) return rb - ra;
    // Same source tier — newest first.
    const ta = new Date(a.recordedAt).getTime();
    const tb = new Date(b.recordedAt).getTime();
    if (ta !== tb) return tb - ta;
    return a.source.localeCompare(b.source);
  })[0]!;

  return {
    field,
    value: (best.medication as Record<string, unknown>)[field],
    source: best.source,
    candidates,
  };
}

/**
 * Merge multiple source records describing the same medication.
 *
 * The merge key is (drugId, medicationId) — callers should pre-group
 * records before passing them in. Within the group, every field is
 * resolved independently using the precedence rules above. A field
 * disagreement at the top of the precedence stack on a substantive
 * field surfaces a ManualReviewEntry so caregivers can decide.
 *
 * Records with mismatched merge keys (different drugId or different
 * medicationId) cause an error — callers should group first.
 */
export function resolveMedicationConflict(
  records: MedicationRecord[],
  options: ResolveOptions = {},
): ResolveResult {
  if (records.length === 0) {
    throw new Error('resolveMedicationConflict: no records supplied');
  }

  const globalPrecedence = options.precedence ?? DEFAULT_PRECEDENCE;
  const substantive = options.substantiveFields ?? SUBSTANTIVE_FIELDS;

  // Sanity: every record must share medicationId (when set) and drugId
  // (when set). Records with neither are merged as a single bucket.
  const medIds = new Set(records.map((r) => r.medication.id).filter(Boolean));
  const drugIds = new Set(records.map((r) => r.medication.drugId).filter(Boolean));
  if (medIds.size > 1) {
    throw new Error(
      `resolveMedicationConflict: records span multiple medication ids: ${[...medIds].join(', ')}`,
    );
  }
  if (drugIds.size > 1) {
    throw new Error(
      `resolveMedicationConflict: records span multiple drug ids: ${[...drugIds].join(', ')}`,
    );
  }

  // Collect the union of all field keys present across records.
  const fields = new Set<MedicationField>();
  for (const r of records) {
    for (const k of Object.keys(r.medication)) fields.add(k as MedicationField);
  }

  const fieldChoices: FieldChoice[] = [];
  const manualReview: ManualReviewEntry[] = [];

  for (const field of fields) {
    const fieldPrecedence = options.fieldPrecedence?.[field] ?? globalPrecedence;
    const choice = chooseField(field, records, fieldPrecedence);
    fieldChoices.push(choice);

    // Detect top-tier conflict: more than one candidate has a non-empty
    // value AND they share the highest precedence rank.
    if (!substantive.includes(field)) continue;
    const ranks = rankMap(fieldPrecedence);
    const topRank = Math.max(
      ...records
        .filter((r) => !isEmpty((r.medication as Record<string, unknown>)[field]))
        .map((r) => ranks.get(r.source) ?? -1),
    );
    if (topRank < 0) continue;
    const topRecords = records.filter(
      (r) =>
        !isEmpty((r.medication as Record<string, unknown>)[field]) &&
        (ranks.get(r.source) ?? -1) === topRank,
    );
    if (topRecords.length < 2) continue;
    // Dedupe by serialized value: identical values are not a conflict.
    const distinct = new Map<string, MedicationRecord>();
    for (const r of topRecords) {
      const k = valueKey((r.medication as Record<string, unknown>)[field]);
      if (!distinct.has(k)) distinct.set(k, r);
    }
    if (distinct.size < 2) continue;
    manualReview.push({
      field,
      candidates: topRecords.map((r) => ({
        source: r.source,
        value: (r.medication as Record<string, unknown>)[field],
        recordedAt: r.recordedAt,
      })),
      chosenSource: choice.source,
      reason: `${distinct.size} sources at the same precedence reported different values for ${String(field)}.`,
    });
  }

  manualReview.sort((a, b) => String(a.field).localeCompare(String(b.field)));
  fieldChoices.sort((a, b) => String(a.field).localeCompare(String(b.field)));

  // Build the merged medication object.
  const medication: Partial<Medication> = {};
  for (const c of fieldChoices) {
    if (c.value !== undefined) (medication as Record<string, unknown>)[c.field] = c.value;
  }

  const sources = Array.from(new Set(records.map((r) => r.source))).sort();

  return { medication, fieldChoices, manualReview, sources };
}

/**
 * Group records by (medicationId|drugId) and resolve each group.
 * Records without an id and without a drugId are skipped with no
 * group (callers shouldn't pass them; this is defensive).
 */
export function resolveAll(
  records: MedicationRecord[],
  options: ResolveOptions = {},
): { key: string; result: ResolveResult }[] {
  const groups = new Map<string, MedicationRecord[]>();
  for (const r of records) {
    const id = r.medication.id ?? '';
    const drugId = r.medication.drugId ?? '';
    if (!id && !drugId) continue;
    const key = id || `drug:${drugId}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  const out: { key: string; result: ResolveResult }[] = [];
  for (const [key, recs] of groups) {
    out.push({ key, result: resolveMedicationConflict(recs, options) });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/**
 * Headline string for the UI:
 *   "Merged 3 records (pharmacy, ehr, manual); 1 field needs review."
 */
export function summarizeResolution(result: ResolveResult): string {
  const head = `Merged ${result.sources.length} source${result.sources.length === 1 ? '' : 's'} (${result.sources.join(', ')})`;
  if (result.manualReview.length === 0) return `${head}; no conflicts.`;
  return `${head}; ${result.manualReview.length} field${result.manualReview.length === 1 ? '' : 's'} need${result.manualReview.length === 1 ? 's' : ''} review.`;
}
