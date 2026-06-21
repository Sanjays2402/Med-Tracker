/**
 * Medication refusal log.
 *
 * Adherence math (computePdc, dose-history-aggregator, streak.ts) treats
 * a missed dose as "patient didn't take it" — same bucket whether the
 * patient was asleep, refused outright, was NPO for a procedure, or
 * just plain forgot. Adherence-risk scoring then over-weights cases
 * where the miss was clinically legitimate, producing nudges that
 * annoy patients ("you missed your sleeping pill at 8am because you
 * were already asleep") and frustrate caregivers ("the patient was in
 * surgery, of course the dose was skipped").
 *
 * This module is the structured log for those legitimate misses: the
 * patient (or caregiver) records WHY the dose wasn't taken, with a
 * reason code from a controlled vocabulary. Downstream:
 *
 *   - Adherence calculators can filter the denominator by refusal-
 *     excluded reasons (NPO, hold-for-procedure, prescriber-paused),
 *     producing both a strict PDC (all misses count) and an honest
 *     PDC (clinically-legitimate misses excluded).
 *   - Reason rollups feed the prescriber a real signal: "patient
 *     refused 8 of the last 14 atorvastatin doses citing muscle pain"
 *     is a different problem from "patient forgot 8 doses".
 *   - Per-medication refusal density flags candidates for a
 *     de-prescribing review when refusals cluster on one drug.
 *
 * Pure / deterministic. No I/O.
 */

import { startOfDay } from './date';

export type RefusalReasonCode =
  /** Patient sleeping at scheduled time. */
  | 'sleeping'
  /** Patient nil-per-os for procedure or surgery. */
  | 'npo'
  /** Prescriber explicitly held the dose. */
  | 'prescriber-paused'
  /** Patient nauseated and could not keep medication down. */
  | 'nausea'
  /** Patient reported a side effect and chose not to take it. */
  | 'side-effect'
  /** Out of supply (refill issue / pharmacy delay). */
  | 'out-of-supply'
  /** Patient declined this dose without elaborating. */
  | 'declined'
  /** Patient was away from medication (travelled without it). */
  | 'travelling'
  /** Patient reports the dose was duplicated by another caregiver. */
  | 'already-taken'
  /** Catch-all; carries the freeForm text. */
  | 'other';

/**
 * Reasons we treat as clinically legitimate and that the "honest"
 * adherence number should EXCLUDE from the denominator. NPO and a
 * prescriber pause are obvious. Out-of-supply is also excluded since
 * the patient cannot adhere to a medication they don't physically
 * have — adherence math should not penalise a pharmacy supply gap.
 *
 * `sleeping` is intentionally NOT in this list: a sleep-time miss is
 * a real adherence problem (the patient should be on a different
 * schedule). It IS surfaced separately so the UI can suggest a
 * schedule change.
 */
export const REFUSAL_EXCLUDED_REASONS: ReadonlySet<RefusalReasonCode> = new Set([
  'npo',
  'prescriber-paused',
  'out-of-supply',
]);

/**
 * Reasons that signal a likely tolerability problem with the
 * medication itself. A pattern here flags a de-prescribing review.
 */
export const REFUSAL_TOLERABILITY_REASONS: ReadonlySet<RefusalReasonCode> = new Set([
  'nausea',
  'side-effect',
]);

export interface MedicationRefusalEntry {
  /** Stable identifier (caller-supplied; deterministic id derived if absent). */
  id?: string;
  /** Which dose was refused. Optional when logging an ad-hoc refusal. */
  doseId?: string;
  medicationId: string;
  medicationName?: string;
  /** When the dose was due. ISO datetime. */
  dueAt: string;
  /** When the refusal was logged. ISO datetime. Defaults to dueAt. */
  loggedAt?: string;
  /** Refusal reason from the controlled vocabulary. */
  reason: RefusalReasonCode;
  /** Free-text elaboration. Required when reason='other'. */
  note?: string;
  /** Who logged it (free text). */
  loggedBy?: string;
}

export interface NormalizedRefusal {
  id: string;
  doseId?: string;
  medicationId: string;
  medicationName?: string;
  dueAt: string;
  loggedAt: string;
  reason: RefusalReasonCode;
  /** True when this reason should be excluded from honest adherence. */
  excludedFromAdherence: boolean;
  /** True when this reason flags a tolerability concern. */
  tolerabilitySignal: boolean;
  note?: string;
  loggedBy?: string;
}

export interface RefusalValidationError {
  index: number;
  code:
    | 'missing-medication'
    | 'missing-reason'
    | 'invalid-reason'
    | 'other-requires-note'
    | 'invalid-dueAt'
    | 'invalid-loggedAt';
  message: string;
}

export interface RefusalValidationResult {
  ok: NormalizedRefusal[];
  errors: RefusalValidationError[];
}

const VALID_REASONS: ReadonlySet<RefusalReasonCode> = new Set<RefusalReasonCode>([
  'sleeping',
  'npo',
  'prescriber-paused',
  'nausea',
  'side-effect',
  'out-of-supply',
  'declined',
  'travelling',
  'already-taken',
  'other',
]);

function deriveId(e: MedicationRefusalEntry): string {
  if (e.id) return e.id;
  if (e.doseId) return `refusal_${e.doseId}`;
  const dueMs = Date.parse(e.dueAt);
  const ms = Number.isFinite(dueMs) ? dueMs : 0;
  let h = 5381;
  const seed = `${e.medicationId}|${ms}|${e.reason}`;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return `refusal_${(h >>> 0).toString(36)}_${ms.toString(36)}`;
}

/**
 * Validate a batch of refusal entries. Returns normalised entries
 * for the ones that pass + a per-index error list for the rest. We
 * never throw on bad input — the UI is the right place to surface
 * row-level errors without losing the rest of the batch.
 */
export function validateRefusals(
  entries: MedicationRefusalEntry[],
): RefusalValidationResult {
  const ok: NormalizedRefusal[] = [];
  const errors: RefusalValidationError[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (!e.medicationId || !e.medicationId.trim()) {
      errors.push({ index: i, code: 'missing-medication', message: 'medicationId is required' });
      continue;
    }
    if (!e.reason) {
      errors.push({ index: i, code: 'missing-reason', message: 'reason is required' });
      continue;
    }
    if (!VALID_REASONS.has(e.reason)) {
      errors.push({
        index: i,
        code: 'invalid-reason',
        message: `unknown reason "${e.reason}"`,
      });
      continue;
    }
    if (e.reason === 'other' && (!e.note || !e.note.trim())) {
      errors.push({
        index: i,
        code: 'other-requires-note',
        message: 'reason "other" requires a note',
      });
      continue;
    }
    const dueMs = Date.parse(e.dueAt);
    if (!Number.isFinite(dueMs)) {
      errors.push({ index: i, code: 'invalid-dueAt', message: 'dueAt must be a valid ISO datetime' });
      continue;
    }
    let loggedAt = e.loggedAt ?? e.dueAt;
    if (e.loggedAt) {
      const loggedMs = Date.parse(e.loggedAt);
      if (!Number.isFinite(loggedMs)) {
        errors.push({
          index: i,
          code: 'invalid-loggedAt',
          message: 'loggedAt must be a valid ISO datetime',
        });
        continue;
      }
      loggedAt = e.loggedAt;
    }
    const normalised: NormalizedRefusal = {
      id: deriveId(e),
      medicationId: e.medicationId.trim(),
      dueAt: e.dueAt,
      loggedAt,
      reason: e.reason,
      excludedFromAdherence: REFUSAL_EXCLUDED_REASONS.has(e.reason),
      tolerabilitySignal: REFUSAL_TOLERABILITY_REASONS.has(e.reason),
    };
    if (e.doseId) normalised.doseId = e.doseId;
    if (e.medicationName) normalised.medicationName = e.medicationName;
    if (e.note && e.note.trim()) normalised.note = e.note.trim();
    if (e.loggedBy && e.loggedBy.trim()) normalised.loggedBy = e.loggedBy.trim();
    ok.push(normalised);
  }
  return { ok, errors };
}

export interface RefusalRollupOptions {
  /**
   * Anchor date for the "recent" window. Default new Date().
   */
  now?: Date;
  /**
   * Days back from `now` to count as recent. Default 30.
   */
  recentWindowDays?: number;
  /**
   * Minimum recent refusals on a single medication before it surfaces
   * in `deprescribingCandidates`. Default 3.
   */
  candidateMinRefusals?: number;
  /**
   * Minimum share of refusals that must be tolerability-coded for
   * the medication to be flagged. Default 0.5 (half).
   */
  candidateMinTolerabilityShare?: number;
}

export interface MedicationRefusalCounts {
  medicationId: string;
  medicationName?: string;
  /** Total refusals across all time. */
  total: number;
  /** Recent refusals (within recentWindowDays). */
  recent: number;
  /** By-reason breakdown across the recent window. */
  recentByReason: Partial<Record<RefusalReasonCode, number>>;
  /** Count of recent refusals whose reason is in REFUSAL_TOLERABILITY_REASONS. */
  recentTolerabilityCount: number;
  /** Share recentTolerabilityCount / recent (0 when recent=0). */
  recentTolerabilityShare: number;
  /** Most recent refusal timestamp across all entries (ISO). */
  lastRefusedAt?: string;
}

export interface RefusalRollup {
  asOf: string;
  recentWindowDays: number;
  perMedication: MedicationRefusalCounts[];
  /** Medications that meet the de-prescribing threshold. */
  deprescribingCandidates: MedicationRefusalCounts[];
  /** Total refusals (recent). */
  totalRecent: number;
  /** Total refusals excluded from adherence (recent). */
  totalRecentExcluded: number;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Roll up validated refusal entries into per-medication counts and
 * surface de-prescribing candidates. A candidate is a medication
 * whose recent refusal count >= candidateMinRefusals AND whose
 * tolerability share >= candidateMinTolerabilityShare.
 *
 * Per-medication rows are sorted by recent count descending, then
 * by name ascending for stability.
 */
export function rollupRefusals(
  refusals: NormalizedRefusal[],
  options: RefusalRollupOptions = {},
): RefusalRollup {
  const now = options.now ?? new Date();
  const recentWindowDays = options.recentWindowDays ?? 30;
  const candidateMinRefusals = options.candidateMinRefusals ?? 3;
  const candidateMinTolerabilityShare = options.candidateMinTolerabilityShare ?? 0.5;

  const recentCutoff = startOfDay(now).getTime() - recentWindowDays * 86_400_000;

  const byMed = new Map<string, MedicationRefusalCounts>();
  let totalRecent = 0;
  let totalRecentExcluded = 0;
  for (const r of refusals) {
    let row = byMed.get(r.medicationId);
    if (!row) {
      row = {
        medicationId: r.medicationId,
        total: 0,
        recent: 0,
        recentByReason: {},
        recentTolerabilityCount: 0,
        recentTolerabilityShare: 0,
      };
      if (r.medicationName) row.medicationName = r.medicationName;
      byMed.set(r.medicationId, row);
    }
    row.total += 1;
    const loggedMs = Date.parse(r.loggedAt);
    if (Number.isFinite(loggedMs) && (!row.lastRefusedAt || row.lastRefusedAt < r.loggedAt)) {
      row.lastRefusedAt = r.loggedAt;
    }
    if (Number.isFinite(loggedMs) && loggedMs >= recentCutoff) {
      row.recent += 1;
      row.recentByReason[r.reason] = (row.recentByReason[r.reason] ?? 0) + 1;
      if (r.tolerabilitySignal) row.recentTolerabilityCount += 1;
      totalRecent += 1;
      if (r.excludedFromAdherence) totalRecentExcluded += 1;
    }
  }

  const perMedication: MedicationRefusalCounts[] = [];
  for (const row of byMed.values()) {
    row.recentTolerabilityShare = row.recent === 0
      ? 0
      : row.recentTolerabilityCount / row.recent;
    perMedication.push(row);
  }
  perMedication.sort((a, b) => {
    if (a.recent !== b.recent) return b.recent - a.recent;
    return (a.medicationName ?? a.medicationId).localeCompare(b.medicationName ?? b.medicationId);
  });

  const deprescribingCandidates = perMedication.filter(
    (m) =>
      m.recent >= candidateMinRefusals &&
      m.recentTolerabilityShare >= candidateMinTolerabilityShare,
  );

  return {
    asOf: toIsoDate(startOfDay(now)),
    recentWindowDays,
    perMedication,
    deprescribingCandidates,
    totalRecent,
    totalRecentExcluded,
  };
}

export interface AdherenceFilterInput {
  /** Total scheduled doses in the measurement window (denominator). */
  scheduledCount: number;
  /** Doses recorded as taken (numerator for adherence). */
  takenCount: number;
  /** Refusal entries logged in the same window. */
  refusals: NormalizedRefusal[];
}

export interface AdherenceWithRefusals {
  /** Strict adherence: takenCount / scheduledCount. NaN guard returns 0. */
  strictAdherence: number;
  /** Excluded count (refusals with excludedFromAdherence=true). */
  excludedCount: number;
  /** Honest adherence: takenCount / (scheduledCount - excludedCount). */
  honestAdherence: number;
  /** Denominator used for honestAdherence (after exclusion). */
  honestDenominator: number;
}

/**
 * Compute strict + honest adherence given a scheduled / taken pair
 * and a list of refusal entries inside the same measurement window.
 *
 *   strict = taken / scheduled
 *   honest = taken / (scheduled - excludedRefusals)
 *
 * When the honest denominator collapses to <= 0 (every dose was an
 * NPO / hold / out-of-supply day), honestAdherence is reported as 1
 * — the patient had zero opportunity to fail, so we don't penalise
 * them. This is the conservative choice for surfacing alerts.
 */
export function computeAdherenceWithRefusals(
  input: AdherenceFilterInput,
): AdherenceWithRefusals {
  const sched = Math.max(0, input.scheduledCount | 0);
  const taken = Math.max(0, input.takenCount | 0);
  const strictAdherence = sched === 0 ? 0 : taken / sched;
  let excludedCount = 0;
  for (const r of input.refusals) if (r.excludedFromAdherence) excludedCount += 1;
  // Cap exclusion at scheduledCount; a caller cannot exclude more
  // doses than were ever scheduled.
  excludedCount = Math.min(excludedCount, sched);
  const honestDenom = sched - excludedCount;
  const honestAdherence = honestDenom <= 0
    ? 1
    : Math.min(1, taken / honestDenom);
  return {
    strictAdherence: Math.min(1, strictAdherence),
    excludedCount,
    honestAdherence,
    honestDenominator: honestDenom,
  };
}
