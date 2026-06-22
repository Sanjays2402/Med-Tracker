/**
 * Regimen snapshot archive restore.
 *
 * `regimen-snapshot-archive` produces a signed JSON envelope of a
 * regimen at a moment in time. The patient (or a clinician) can
 * persist that envelope offline and later ask to RESTORE the
 * regimen from it — for example after a hospital admission wiped
 * their working medication list, or when migrating between
 * Med-Tracker installations.
 *
 * This module is the round-trip companion. Given a signed envelope
 * and the secret used to sign it, it:
 *
 *   1. Verifies the envelope (signature + payload hash) via
 *      verifyRegimenSnapshot. NEVER touch the regimen until the
 *      envelope is verified — a forged or tampered envelope must
 *      be rejected before any restore plan is computed.
 *   2. Optionally compares against the CURRENT working regimen and
 *      produces a structured RestorePlan: which medications would
 *      be added back, which would be re-activated, which would be
 *      strength-changed, which already match exactly.
 *   3. Surfaces collisions explicitly (same medication id with
 *      different fields) so the restore UI can ask the patient
 *      "the snapshot has lisinopril 5mg but you currently have
 *      lisinopril 10mg — which one is correct?" instead of
 *      silently overwriting.
 *
 * The restore plan is a PROPOSAL — this module never writes to a
 * database, never mutates the current regimen, never sends a
 * notification. The caller is the source of truth for whether and
 * how to apply the plan.
 *
 * Pure / deterministic. Isomorphic via globalThis.crypto.subtle
 * (same pattern as regimen-snapshot-archive).
 */

import type { Medication, Schedule } from '@med/types';
import {
  verifyRegimenSnapshot,
  type SignedRegimenSnapshot,
  type SnapshotPayload,
  type SnapshotPayloadItem,
  type SnapshotSchedule,
} from './regimen-snapshot-archive';

export interface CurrentRegimenItem {
  medication: Medication;
  schedules: Schedule[];
  prescriberId?: string;
  pharmacyId?: string;
}

export type RestoreItemAction =
  /** Snapshot had a medication the current regimen does not. */
  | 'add'
  /** Both have the medication but the current row is inactive — re-enable. */
  | 'reactivate'
  /** Same medication, snapshot strength differs from current strength. */
  | 'strength-change'
  /** Same medication, snapshot schedule list differs from current. */
  | 'schedule-change'
  /** Same medication, snapshot prescriberId differs from current. */
  | 'prescriber-change'
  /** Same medication, snapshot pharmacyId differs from current. */
  | 'pharmacy-change'
  /** Snapshot matches the current entry exactly. */
  | 'unchanged'
  /**
   * Snapshot has a medication that the current regimen has but with
   * MULTIPLE divergent fields — caller must adjudicate. The
   * `changes` list enumerates which fields diverged.
   */
  | 'collision';

export interface RestoreItemPlan {
  medicationId: string;
  name: string;
  /** Action the restore would take for this row. */
  action: RestoreItemAction;
  /** When action is collision, the field names that diverged. */
  changes?: ('strength' | 'schedules' | 'prescriber' | 'pharmacy' | 'active')[];
  /** Snapshot payload row (always populated). */
  fromSnapshot: SnapshotPayloadItem;
  /** Current regimen item (populated when current has a match). */
  current?: CurrentRegimenItem;
}

export interface RestoreCurrentOnlyItem {
  medicationId: string;
  name: string;
  /**
   * Reason this row exists ONLY in current:
   *   'added-after-snapshot' — patient added the med after the
   *     snapshot was taken (normal case for a stale snapshot).
   * The restore UI typically OFFERS to keep these rather than
   * dropping them; the snapshot is not the only source of truth.
   */
  reason: 'added-after-snapshot';
  current: CurrentRegimenItem;
}

export interface RegimenRestorePlan {
  /** Snapshot id this plan was built from. */
  snapshotId: string;
  /** Snapshot's takenAt timestamp. */
  takenAt: string;
  /** Snapshot patient id. */
  patientId: string;
  /** Per-row plan, sorted by medication name ascending. */
  items: RestoreItemPlan[];
  /** Rows in current regimen that are NOT in the snapshot. */
  currentOnly: RestoreCurrentOnlyItem[];
  /** Counts by action for the dashboard "diff summary" chip bar. */
  counts: Record<RestoreItemAction, number>;
  /** True when applying this plan would change at least one row. */
  hasChanges: boolean;
}

export interface RestoreOptions {
  /**
   * Current regimen (working set) to diff against. When omitted,
   * every snapshot row is treated as an 'add'.
   */
  current?: CurrentRegimenItem[];
}

export type RegimenRestoreResult =
  | { ok: true; plan: RegimenRestorePlan; payload: SnapshotPayload }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'bad-version'
        | 'signature-mismatch'
        | 'payload-tampered'
        | 'secret-too-short';
    };

function emptyCounts(): Record<RestoreItemAction, number> {
  return {
    add: 0,
    reactivate: 0,
    'strength-change': 0,
    'schedule-change': 0,
    'prescriber-change': 0,
    'pharmacy-change': 0,
    unchanged: 0,
    collision: 0,
  };
}

function normalizeScheduleForCompare(s: Schedule): SnapshotSchedule {
  // Mirror regimen-snapshot-archive.normaliseSchedule so the
  // comparison is apples-to-apples.
  return {
    scheduleId: s.id,
    kind: s.kind,
    times: [...s.times].sort(),
    daysOfWeek: [...(s.daysOfWeek ?? [])].sort((a, b) => a - b),
    intervalHours: s.intervalHours ?? null,
    cronExpression: s.cronExpression ?? null,
    enabled: s.enabled,
    startsAt: s.startsAt,
    endsAt: s.endsAt ?? null,
  };
}

function schedulesEqual(a: SnapshotSchedule[], b: SnapshotSchedule[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = [...a].sort((x, y) => x.scheduleId.localeCompare(y.scheduleId));
  const bSorted = [...b].sort((x, y) => x.scheduleId.localeCompare(y.scheduleId));
  for (let i = 0; i < aSorted.length; i++) {
    const x = aSorted[i]!;
    const y = bSorted[i]!;
    if (x.scheduleId !== y.scheduleId) return false;
    if (x.kind !== y.kind) return false;
    if (x.enabled !== y.enabled) return false;
    if (x.startsAt !== y.startsAt) return false;
    if (x.endsAt !== y.endsAt) return false;
    if (x.intervalHours !== y.intervalHours) return false;
    if (x.cronExpression !== y.cronExpression) return false;
    if (x.times.length !== y.times.length) return false;
    for (let j = 0; j < x.times.length; j++) if (x.times[j] !== y.times[j]) return false;
    if (x.daysOfWeek.length !== y.daysOfWeek.length) return false;
    for (let j = 0; j < x.daysOfWeek.length; j++) if (x.daysOfWeek[j] !== y.daysOfWeek[j]) return false;
  }
  return true;
}

function diffItem(
  snap: SnapshotPayloadItem,
  current: CurrentRegimenItem,
): {
  action: RestoreItemAction;
  changes?: ('strength' | 'schedules' | 'prescriber' | 'pharmacy' | 'active')[];
} {
  const changes: ('strength' | 'schedules' | 'prescriber' | 'pharmacy' | 'active')[] = [];
  // Reactivate is a STRONGER signal than the others — the patient is
  // explicitly asking "put this back on" not "edit fields".
  const reactivate = snap.active && !current.medication.active;
  if (snap.strength !== current.medication.strength) changes.push('strength');
  const snapSchedules = snap.schedules;
  const currentSchedules = current.schedules.map(normalizeScheduleForCompare);
  if (!schedulesEqual(snapSchedules, currentSchedules)) changes.push('schedules');
  const currentPrescriber = current.prescriberId ?? null;
  if ((snap.prescriberId ?? null) !== currentPrescriber) changes.push('prescriber');
  const currentPharmacy = current.pharmacyId ?? null;
  if ((snap.pharmacyId ?? null) !== currentPharmacy) changes.push('pharmacy');
  if (reactivate) changes.push('active');

  if (changes.length === 0) return { action: 'unchanged' };
  if (changes.length === 1) {
    // Single-field change collapses to a focused action.
    if (changes[0] === 'active') return { action: 'reactivate' };
    if (changes[0] === 'strength') return { action: 'strength-change' };
    if (changes[0] === 'schedules') return { action: 'schedule-change' };
    if (changes[0] === 'prescriber') return { action: 'prescriber-change' };
    if (changes[0] === 'pharmacy') return { action: 'pharmacy-change' };
  }
  return { action: 'collision', changes };
}

function buildPlan(payload: SnapshotPayload, options: RestoreOptions): RegimenRestorePlan {
  const current = options.current ?? [];
  const currentById = new Map(current.map((c) => [c.medication.id, c]));
  const items: RestoreItemPlan[] = [];
  const counts = emptyCounts();
  const seenSnap = new Set<string>();

  for (const snap of payload.items) {
    seenSnap.add(snap.medicationId);
    const cur = currentById.get(snap.medicationId);
    if (!cur) {
      items.push({
        medicationId: snap.medicationId,
        name: snap.name,
        action: 'add',
        fromSnapshot: snap,
      });
      counts.add += 1;
      continue;
    }
    const { action, changes } = diffItem(snap, cur);
    const plan: RestoreItemPlan = {
      medicationId: snap.medicationId,
      name: snap.name,
      action,
      fromSnapshot: snap,
      current: cur,
    };
    if (changes && changes.length > 0) plan.changes = changes;
    items.push(plan);
    counts[action] += 1;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));

  const currentOnly: RestoreCurrentOnlyItem[] = [];
  for (const c of current) {
    if (!seenSnap.has(c.medication.id)) {
      currentOnly.push({
        medicationId: c.medication.id,
        name: c.medication.name,
        reason: 'added-after-snapshot',
        current: c,
      });
    }
  }
  currentOnly.sort((a, b) => a.name.localeCompare(b.name));

  const changesCount =
    counts.add +
    counts.reactivate +
    counts['strength-change'] +
    counts['schedule-change'] +
    counts['prescriber-change'] +
    counts['pharmacy-change'] +
    counts.collision;
  return {
    snapshotId: payload.snapshotId,
    takenAt: payload.takenAt,
    patientId: payload.patientId,
    items,
    currentOnly,
    counts,
    hasChanges: changesCount > 0,
  };
}

/**
 * Verify a signed snapshot envelope and (when verification passes)
 * produce a structured RestorePlan describing what would change if
 * the snapshot were applied. The plan is a PROPOSAL — this function
 * never writes to a database, never mutates the current regimen.
 *
 * Failure modes mirror verifyRegimenSnapshot exactly:
 *   - 'malformed' (shape/keys wrong),
 *   - 'bad-version' (unsupported v),
 *   - 'signature-mismatch' (HMAC didn't match),
 *   - 'payload-tampered' (payload hash didn't match),
 *   - 'secret-too-short' (< 32 chars).
 */
export async function restoreRegimenFromSnapshot(
  envelope: unknown,
  secret: string,
  options: RestoreOptions = {},
): Promise<RegimenRestoreResult> {
  const verification = await verifyRegimenSnapshot(envelope, secret);
  if (!verification.ok) return { ok: false, reason: verification.reason };
  const plan = buildPlan(verification.payload, options);
  return { ok: true, plan, payload: verification.payload };
}

/**
 * Build a RestorePlan from an already-verified snapshot payload.
 * Useful when the caller has already verified the envelope (perhaps
 * through a higher-level audit pipeline) and just needs the diff.
 *
 * Skips verification — caller is responsible for ensuring `payload`
 * came from verifyRegimenSnapshot(...).ok === true.
 */
export function planRestoreFromPayload(
  payload: SnapshotPayload,
  options: RestoreOptions = {},
): RegimenRestorePlan {
  return buildPlan(payload, options);
}

/**
 * Convenience: produce a flat, human-readable summary of the plan.
 *   "Restore 3 add, 1 reactivate, 1 strength-change. Skip 0 unchanged.
 *    1 medication in current regimen has no snapshot match."
 */
export function summarizeRestorePlan(plan: RegimenRestorePlan): string {
  if (!plan.hasChanges && plan.currentOnly.length === 0) {
    return 'Snapshot is identical to current regimen. Nothing to restore.';
  }
  const parts: string[] = [];
  const order: RestoreItemAction[] = [
    'add',
    'reactivate',
    'strength-change',
    'schedule-change',
    'prescriber-change',
    'pharmacy-change',
    'collision',
  ];
  for (const a of order) {
    if (plan.counts[a] > 0) parts.push(`${plan.counts[a]} ${a}`);
  }
  const head = parts.length > 0
    ? `Restore ${parts.join(', ')}.`
    : 'Restore: no changes proposed.';
  const tail = plan.counts.unchanged > 0
    ? ` Skip ${plan.counts.unchanged} unchanged.`
    : '';
  const co = plan.currentOnly.length > 0
    ? ` ${plan.currentOnly.length} medication${plan.currentOnly.length === 1 ? '' : 's'} in current regimen ${plan.currentOnly.length === 1 ? 'has' : 'have'} no snapshot match.`
    : '';
  return head + tail + co;
}

/** Re-export verifier failure reasons so callers don't have to also
 *  import from regimen-snapshot-archive. */
export type { SignedRegimenSnapshot, SnapshotPayload };
