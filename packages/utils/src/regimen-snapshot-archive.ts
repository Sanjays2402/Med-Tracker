/**
 * Regimen snapshot archive.
 *
 * A patient's regimen evolves continuously: meds get added, removed,
 * doses change, prescribers swap. For certain workflows the patient
 * (or a caregiver) needs a STABLE, signed snapshot of the regimen at
 * a moment in time:
 *
 *   - sending the regimen to a new clinician (records request),
 *   - legal/forensic use (custody dispute, disability claim),
 *   - clinical trial enrolment ("what were you on at screening?"),
 *   - patient-side audit ("the pharmacy denies my history; here's a
 *     signed snapshot from 30 days ago").
 *
 * This module produces a deterministic JSON snapshot signed with
 * HMAC-SHA-256 over a server-held secret (same crypto.subtle pattern
 * as caregiver-share-token: runs in Node 18+ and the browser, no
 * @types/node dependency). The signed envelope:
 *
 *     {
 *       v: 1,
 *       snapshotId: "<uuid>",
 *       takenAt: "<iso8601>",
 *       payload: <canonicalised regimen JSON>,
 *       payloadHash: "<sha-256 hex of canonical payload>",
 *       signature: "<base64url(hmac-sha256(payload || takenAt || snapshotId))>"
 *     }
 *
 * `verifyRegimenSnapshot` checks the signature AND the payload hash
 * (catches "I edited the JSON but the signature is right" vs "I
 * stripped a med and recomputed everything"). Verification returns a
 * discriminated union so the caller can distinguish malformed /
 * bad-version / signature-mismatch / payload-tampered / secret-too-short.
 *
 * Pure / deterministic. Isomorphic via globalThis.crypto.subtle.
 */

import type { Medication, Schedule } from '@med/types';

export interface RegimenSnapshotInputItem {
  medication: Medication;
  /** Schedules for this medication. */
  schedules: Schedule[];
  /** Optional prescriber id (linked to prescriber-directory). */
  prescriberId?: string;
  /** Optional dispensing pharmacy id. */
  pharmacyId?: string;
}

export interface BuildSnapshotInput {
  /** UUID assigned to this snapshot. The caller persists this on the snapshot row. */
  snapshotId: string;
  /** Patient id (uuid). */
  patientId: string;
  /** Free-form patient display name (denormalised for offline reads). */
  patientName: string;
  /** Items: medications + schedules + optional join keys. */
  items: RegimenSnapshotInputItem[];
  /** Optional metadata block (clinic, reason, source app version). */
  meta?: Record<string, string>;
  /** Server-side HMAC secret. Must be >= 32 chars. */
  secret: string;
  /** Snapshot timestamp. Defaults to new Date(). */
  takenAt?: Date;
}

export interface SnapshotPayloadItem {
  medicationId: string;
  drugId: string;
  name: string;
  strength: string;
  form: Medication['form'];
  active: boolean;
  supplyRemaining: number;
  dosesPerRefill: number;
  startDate: string;
  endDate: string | null;
  instructions: string | null;
  prescriberId: string | null;
  pharmacyId: string | null;
  /** Sorted, normalised schedule snapshot. */
  schedules: SnapshotSchedule[];
}

export interface SnapshotSchedule {
  scheduleId: string;
  kind: Schedule['kind'];
  times: string[];
  daysOfWeek: number[];
  intervalHours: number | null;
  cronExpression: string | null;
  enabled: boolean;
  startsAt: string;
  endsAt: string | null;
}

export interface SnapshotPayload {
  v: 1;
  snapshotId: string;
  patientId: string;
  patientName: string;
  takenAt: string;
  itemCount: number;
  items: SnapshotPayloadItem[];
  meta: Record<string, string>;
}

export interface SignedRegimenSnapshot {
  v: 1;
  snapshotId: string;
  takenAt: string;
  payload: SnapshotPayload;
  /** SHA-256 hex of the canonical payload JSON. */
  payloadHash: string;
  /** base64url(HMAC-SHA-256(canonicalPayload || takenAt || snapshotId)). */
  signature: string;
}

export type SnapshotVerificationReason =
  | 'malformed'
  | 'bad-version'
  | 'signature-mismatch'
  | 'payload-tampered'
  | 'secret-too-short';

export type SnapshotVerificationResult =
  | { ok: true; snapshotId: string; takenAt: Date; payload: SnapshotPayload }
  | { ok: false; reason: SnapshotVerificationReason };

const MIN_SECRET_LENGTH = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const padLen = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function asBufferSource(b: Uint8Array): ArrayBuffer {
  const fresh = new ArrayBuffer(b.byteLength);
  new Uint8Array(fresh).set(b);
  return fresh;
}

function bytesToHex(bytes: Uint8Array): string {
  const out: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i]!.toString(16).padStart(2, '0');
  }
  return out.join('');
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    asBufferSource(stringToBytes(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', asBufferSource(input));
  return bytesToHex(new Uint8Array(hash));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Serialise a value to JSON with sorted object keys and stable
 * representation for arrays. This is the canonicalisation step — both
 * sign and verify must produce identical bytes from identical inputs.
 *
 * Objects: keys sorted lexicographically.
 * Arrays: kept in input order (schedules + items are pre-sorted by the
 *   builder, so caller-supplied order is canonical).
 * Primitives: emitted via JSON.stringify defaults.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') +
    '}'
  );
}

function normaliseSchedule(s: Schedule): SnapshotSchedule {
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

function buildPayload(input: BuildSnapshotInput, takenAt: Date): SnapshotPayload {
  const items: SnapshotPayloadItem[] = input.items
    .map<SnapshotPayloadItem>((it) => ({
      medicationId: it.medication.id,
      drugId: it.medication.drugId,
      name: it.medication.name,
      strength: it.medication.strength,
      form: it.medication.form,
      active: it.medication.active,
      supplyRemaining: it.medication.supplyRemaining,
      dosesPerRefill: it.medication.dosesPerRefill,
      startDate: it.medication.startDate,
      endDate: it.medication.endDate ?? null,
      instructions: it.medication.instructions ?? null,
      prescriberId: it.prescriberId ?? null,
      pharmacyId: it.pharmacyId ?? null,
      schedules: it.schedules
        .map(normaliseSchedule)
        .sort((a, b) => a.scheduleId.localeCompare(b.scheduleId)),
    }))
    .sort((a, b) => a.medicationId.localeCompare(b.medicationId));

  return {
    v: 1,
    snapshotId: input.snapshotId,
    patientId: input.patientId,
    patientName: input.patientName,
    takenAt: takenAt.toISOString(),
    itemCount: items.length,
    items,
    meta: input.meta ?? {},
  };
}

/**
 * Build + sign a regimen snapshot. The returned envelope is safe to
 * persist as opaque JSON; verifyRegimenSnapshot recovers the original
 * payload + verifies the signature + payload hash.
 *
 * Sign material = canonicalPayloadJson || takenAtIso || snapshotId
 * (concatenated). This binds the signature to all three: tampering
 * with the payload OR the takenAt OR the snapshotId all invalidate
 * the signature.
 */
export async function buildRegimenSnapshot(input: BuildSnapshotInput): Promise<SignedRegimenSnapshot> {
  if (input.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const takenAt = input.takenAt ?? new Date();
  if (!Number.isFinite(takenAt.getTime())) {
    throw new Error('takenAt must be a valid Date');
  }
  const payload = buildPayload(input, takenAt);
  const canonical = canonicalStringify(payload);
  const canonicalBytes = stringToBytes(canonical);

  const payloadHash = await sha256Hex(canonicalBytes);
  const signMaterial = canonical + '|' + payload.takenAt + '|' + payload.snapshotId;
  const key = await importHmacKey(input.secret);
  const sigBytes = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    asBufferSource(stringToBytes(signMaterial)),
  );
  const signature = bytesToBase64Url(new Uint8Array(sigBytes));

  return {
    v: 1,
    snapshotId: payload.snapshotId,
    takenAt: payload.takenAt,
    payload,
    payloadHash,
    signature,
  };
}

/**
 * Verify a snapshot envelope. Checks: structural shape, version,
 * payload hash (catches blind payload edits), HMAC signature
 * (catches payload+hash edits without the secret).
 *
 * Returns a discriminated union so the caller can map specific
 * failures to messages without parsing strings.
 */
export async function verifyRegimenSnapshot(
  envelope: unknown,
  secret: string,
): Promise<SnapshotVerificationResult> {
  if (secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: 'secret-too-short' };
  if (!envelope || typeof envelope !== 'object') return { ok: false, reason: 'malformed' };
  const env = envelope as Partial<SignedRegimenSnapshot>;
  if (
    typeof env.snapshotId !== 'string' ||
    typeof env.takenAt !== 'string' ||
    typeof env.payloadHash !== 'string' ||
    typeof env.signature !== 'string' ||
    !env.payload ||
    typeof env.payload !== 'object'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (env.v !== 1 || env.payload.v !== 1) return { ok: false, reason: 'bad-version' };

  // Cross-checks: top-level snapshotId/takenAt must match the payload.
  if (env.snapshotId !== env.payload.snapshotId) return { ok: false, reason: 'payload-tampered' };
  if (env.takenAt !== env.payload.takenAt) return { ok: false, reason: 'payload-tampered' };

  const canonical = canonicalStringify(env.payload);
  const canonicalBytes = stringToBytes(canonical);

  const recomputedHash = await sha256Hex(canonicalBytes);
  if (recomputedHash !== env.payloadHash) return { ok: false, reason: 'payload-tampered' };

  const signMaterial = canonical + '|' + env.takenAt + '|' + env.snapshotId;
  const key = await importHmacKey(secret);
  let givenSig: Uint8Array;
  try {
    givenSig = base64UrlToBytes(env.signature);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const recomputedSig = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      asBufferSource(stringToBytes(signMaterial)),
    ),
  );
  if (!constantTimeEqual(givenSig, recomputedSig)) {
    return { ok: false, reason: 'signature-mismatch' };
  }

  return {
    ok: true,
    snapshotId: env.snapshotId,
    takenAt: new Date(env.takenAt),
    payload: env.payload,
  };
}

/**
 * Diff helper: compare two verified snapshots and return which
 * medications appeared / disappeared / changed strength between them.
 * Pure structural diff — does NOT classify schedules (use
 * regimen-change-diff for that level of detail).
 */
export interface SnapshotDiff {
  added: { medicationId: string; name: string }[];
  removed: { medicationId: string; name: string }[];
  strengthChanged: { medicationId: string; name: string; before: string; after: string }[];
  unchangedCount: number;
}

export function diffRegimenSnapshots(
  before: SnapshotPayload,
  after: SnapshotPayload,
): SnapshotDiff {
  const beforeById = new Map(before.items.map((it) => [it.medicationId, it]));
  const afterById = new Map(after.items.map((it) => [it.medicationId, it]));

  const added: SnapshotDiff['added'] = [];
  const removed: SnapshotDiff['removed'] = [];
  const strengthChanged: SnapshotDiff['strengthChanged'] = [];
  let unchanged = 0;

  for (const [id, b] of beforeById.entries()) {
    const a = afterById.get(id);
    if (!a) {
      removed.push({ medicationId: id, name: b.name });
      continue;
    }
    if (a.strength !== b.strength) {
      strengthChanged.push({ medicationId: id, name: a.name, before: b.strength, after: a.strength });
    } else {
      unchanged += 1;
    }
  }
  for (const [id, a] of afterById.entries()) {
    if (!beforeById.has(id)) added.push({ medicationId: id, name: a.name });
  }
  added.sort((x, y) => x.name.localeCompare(y.name));
  removed.sort((x, y) => x.name.localeCompare(y.name));
  strengthChanged.sort((x, y) => x.name.localeCompare(y.name));
  return { added, removed, strengthChanged, unchangedCount: unchanged };
}
