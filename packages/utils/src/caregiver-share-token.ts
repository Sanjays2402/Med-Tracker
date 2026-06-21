/**
 * Caregiver share token generation and verification.
 *
 * A CaregiverShare lives in the database with a stable `id`, a list
 * of `scopes`, an optional `expiresAt`, and an opaque `token`. The
 * token is what we hand to the caregiver — over SMS, in an email,
 * embedded in a URL — and what gets presented to the API to prove
 * access. Two properties matter for safety:
 *
 *   1. Tamper-resistance: the token's claimed scopes/expiry must not
 *      be editable client-side. We sign a compact payload with HMAC-
 *      SHA-256 over a server-held secret and verify the signature on
 *      every presentation.
 *   2. Replay/expiry: each token carries its own expiry (separate
 *      from the share row's stored expiresAt — both must agree) so a
 *      revoked share's token stops working even if the API forgets
 *      to consult the DB on a fast path.
 *
 * Token format (URL-safe):
 *
 *     mtks_<base64url(payload-json)>.<base64url(hmac-sha256-sig)>
 *
 * where payload-json is { v, sid, scp, iat, exp }:
 *   - v: format version, currently 1
 *   - sid: share id (uuid)
 *   - scp: short scope codes (vm = view-meds, va = view-adherence,
 *          vr = view-refills) - keeps tokens compact
 *   - iat: issued-at, epoch seconds
 *   - exp: expiry, epoch seconds; omitted for never-expiring
 *
 * Uses globalThis.crypto.subtle so the same code runs in Node 18+
 * and the browser (no @types/node dep required).
 */

import type { CaregiverShare } from '@med/types';

export type TokenScope = NonNullable<CaregiverShare['scopes']>[number];

export interface IssueTokenInput {
  /** CaregiverShare row this token represents. */
  share: Pick<CaregiverShare, 'id' | 'scopes' | 'expiresAt'>;
  /** Server-side HMAC secret. Must be at least 32 bytes of entropy. */
  secret: string;
  /** Optional override for the issued-at timestamp. Defaults to now. */
  issuedAt?: Date;
  /**
   * Optional explicit expiry. Falls back to share.expiresAt. Use this when
   * you want a per-token expiry shorter than the share's overall expiry
   * (e.g. a 24h preview link off a 90-day share).
   */
  expiresAt?: Date;
}

export interface VerifyTokenInput {
  token: string;
  secret: string;
  /** Reference clock. Default new Date(). */
  now?: Date;
}

export type VerificationFailureReason =
  | 'malformed'
  | 'bad-version'
  | 'signature-mismatch'
  | 'expired'
  | 'not-yet-valid'
  | 'secret-too-short';

export type VerificationResult =
  | { ok: true; shareId: string; scopes: TokenScope[]; issuedAt: Date; expiresAt: Date | null }
  | { ok: false; reason: VerificationFailureReason };

interface TokenPayload {
  v: 1;
  sid: string;
  scp: string[];
  iat: number;
  exp?: number;
}

const PREFIX = 'mtks_';
const MIN_SECRET_LENGTH = 32;

const SCOPE_TO_CODE: Record<TokenScope, string> = {
  'view-meds': 'vm',
  'view-adherence': 'va',
  'view-refills': 'vr',
};

const CODE_TO_SCOPE: Record<string, TokenScope> = {
  vm: 'view-meds',
  va: 'view-adherence',
  vr: 'view-refills',
};

function bytesToBase64Url(bytes: Uint8Array): string {
  // btoa expects a binary string. Build it without allocating a huge string.
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

function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

/**
 * Coerce a Uint8Array to an ArrayBuffer-backed BufferSource that
 * crypto.subtle accepts. TS 5.7+ no longer treats
 * `Uint8Array<ArrayBufferLike>` as a subtype of `ArrayBufferView`,
 * so we hand subtle a fresh ArrayBuffer-backed view.
 */
function asBufferSource(b: Uint8Array): ArrayBuffer {
  // Copy into a fresh ArrayBuffer to discard the ArrayBufferLike wrapper.
  const fresh = new ArrayBuffer(b.byteLength);
  new Uint8Array(fresh).set(b);
  return fresh;
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

/**
 * Constant-time comparison of two byte arrays. Bails to false on length
 * mismatch (length itself is not secret).
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Compact 16-bit checksum to catch obvious typos before HMAC verify runs. */
function quickFingerprint(payloadB64: string): string {
  let h = 5381;
  for (let i = 0; i < payloadB64.length; i++) h = ((h << 5) + h + payloadB64.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Issue a signed caregiver share token. Rejects secrets shorter than
 * 32 bytes — too-short keys break HMAC's security promise.
 */
export async function issueCaregiverShareToken(input: IssueTokenInput): Promise<string> {
  if (input.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const iat = Math.floor((input.issuedAt ?? new Date()).getTime() / 1000);
  const shareExpiry =
    typeof input.share.expiresAt === 'string' ? new Date(input.share.expiresAt) : null;
  const explicitExpiry = input.expiresAt ?? shareExpiry;
  const exp = explicitExpiry ? Math.floor(explicitExpiry.getTime() / 1000) : undefined;
  if (exp !== undefined && exp <= iat) {
    throw new Error('expiresAt must be after issuedAt');
  }
  const scp = (input.share.scopes ?? [])
    .map((s) => SCOPE_TO_CODE[s])
    .filter(Boolean);
  const payload: TokenPayload = { v: 1, sid: input.share.id, scp, iat, ...(exp !== undefined ? { exp } : {}) };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = bytesToBase64Url(stringToBytes(payloadJson));
  const key = await importHmacKey(input.secret);
  const signedBytes = await globalThis.crypto.subtle.sign('HMAC', key, asBufferSource(stringToBytes(payloadB64)));
  const sigB64 = bytesToBase64Url(new Uint8Array(signedBytes));
  return `${PREFIX}${payloadB64}.${sigB64}`;
}

/**
 * Verify a token's signature, version, and expiry. Returns a discriminated
 * union so the caller can surface a specific failure reason to the API
 * client without leaking the difference between "expired" and "tampered"
 * to an unauthenticated edge.
 */
export async function verifyCaregiverShareToken(input: VerifyTokenInput): Promise<VerificationResult> {
  if (input.secret.length < MIN_SECRET_LENGTH) return { ok: false, reason: 'secret-too-short' };
  if (!input.token.startsWith(PREFIX)) return { ok: false, reason: 'malformed' };
  const body = input.token.slice(PREFIX.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) return { ok: false, reason: 'malformed' };
  const payloadB64 = body.slice(0, dot);
  const sigB64 = body.slice(dot + 1);

  let payload: TokenPayload;
  try {
    const json = bytesToString(base64UrlToBytes(payloadB64));
    payload = JSON.parse(json) as TokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload?.v !== 1) return { ok: false, reason: 'bad-version' };
  if (typeof payload.sid !== 'string' || !Array.isArray(payload.scp) || typeof payload.iat !== 'number') {
    return { ok: false, reason: 'malformed' };
  }

  const key = await importHmacKey(input.secret);
  let givenSig: Uint8Array;
  try {
    givenSig = base64UrlToBytes(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const expectedSig = new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', key, asBufferSource(stringToBytes(payloadB64))),
  );
  if (!constantTimeEqual(givenSig, expectedSig)) return { ok: false, reason: 'signature-mismatch' };

  const nowSec = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (payload.iat > nowSec + 60) return { ok: false, reason: 'not-yet-valid' }; // 60s clock skew tolerance
  if (typeof payload.exp === 'number' && payload.exp <= nowSec) return { ok: false, reason: 'expired' };

  const scopes = payload.scp.map((c) => CODE_TO_SCOPE[c]).filter((s): s is TokenScope => !!s);
  return {
    ok: true,
    shareId: payload.sid,
    scopes,
    issuedAt: new Date(payload.iat * 1000),
    expiresAt: typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null,
  };
}

/**
 * Decode a token's payload without verifying its signature. Useful for
 * the UI ("this link belongs to share X") but MUST NOT be used to make
 * authorization decisions. Returns null on malformed input.
 */
export function decodeTokenUnsafe(token: string): { shareId: string; scopes: TokenScope[]; issuedAt: Date; expiresAt: Date | null; fingerprint: string } | null {
  if (!token.startsWith(PREFIX)) return null;
  const body = token.slice(PREFIX.length);
  const dot = body.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = body.slice(0, dot);
  try {
    const json = bytesToString(base64UrlToBytes(payloadB64));
    const payload = JSON.parse(json) as TokenPayload;
    if (payload?.v !== 1 || typeof payload.sid !== 'string') return null;
    return {
      shareId: payload.sid,
      scopes: (payload.scp ?? []).map((c) => CODE_TO_SCOPE[c]).filter((s): s is TokenScope => !!s),
      issuedAt: new Date(payload.iat * 1000),
      expiresAt: typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null,
      fingerprint: quickFingerprint(payloadB64),
    };
  } catch {
    return null;
  }
}
