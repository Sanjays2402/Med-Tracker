import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Caregiver share tokens.
 *
 * A caregiver token grants a third party read-only access to a subset of the
 * patient's record. Tokens are HMAC-signed strings of the form
 * `<payloadB64>.<sigB64>` where the payload encodes the userId, shareId,
 * scopes, issuedAt, and optional expiresAt. The signature is computed with a
 * server-side secret and verified in constant time on each request.
 *
 * Tokens are intentionally short and URL-safe so they can ride in a share
 * link query string. Rotation issues a new token without invalidating the
 * share's identity; revocation removes the share entirely.
 */

export type CaregiverScope = 'view-meds' | 'view-adherence' | 'view-refills';

export const ALL_SCOPES: CaregiverScope[] = ['view-meds', 'view-adherence', 'view-refills'];

export interface CaregiverShareRecord {
  id: string;
  userId: string;
  label: string;
  scopes: CaregiverScope[];
  tokenSignature: string; // last 16 chars of current token sig, for display/audit
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface TokenPayload {
  uid: string; // userId
  sid: string; // shareId
  s: CaregiverScope[];
  iat: number; // seconds
  exp: number | null; // seconds or null
  jti: string; // unique token id; prevents identical bytes on rotate within same second
}

export interface IssueResult {
  share: CaregiverShareRecord;
  token: string;
}

export interface VerifyResult {
  ok: true;
  payload: TokenPayload;
  share: CaregiverShareRecord;
}

export interface VerifyFailure {
  ok: false;
  reason: 'invalid_format' | 'bad_signature' | 'expired' | 'revoked' | 'unknown_share' | 'scope_denied';
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export class CaregiverService {
  private shares = new Map<string, CaregiverShareRecord>();

  constructor(private readonly secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error('CaregiverService secret must be at least 16 characters');
    }
  }

  /** Issue a new share + token for the given user. */
  issue(input: {
    userId: string;
    label: string;
    scopes: CaregiverScope[];
    ttlSeconds?: number | null;
    now?: Date;
  }): IssueResult {
    const now = input.now ?? new Date();
    const scopes = this.normalizeScopes(input.scopes);
    const shareId = b64url(randomBytes(12));
    const exp = input.ttlSeconds && input.ttlSeconds > 0
      ? Math.floor(now.getTime() / 1000) + input.ttlSeconds
      : null;
    const token = this.sign({
      uid: input.userId,
      sid: shareId,
      s: scopes,
      iat: Math.floor(now.getTime() / 1000),
      exp,
      jti: b64url(randomBytes(8)),
    });
    const share: CaregiverShareRecord = {
      id: shareId,
      userId: input.userId,
      label: input.label.trim().slice(0, 80) || 'caregiver',
      scopes,
      tokenSignature: token.split('.')[1]!.slice(-16),
      createdAt: now.toISOString(),
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      revokedAt: null,
    };
    this.shares.set(shareId, share);
    return { share, token };
  }

  /** Rotate a share's token. Keeps shareId, scopes, label, and expiresAt. */
  rotate(shareId: string, now: Date = new Date()): IssueResult {
    const existing = this.shares.get(shareId);
    if (!existing) throw new Error('share not found');
    if (existing.revokedAt) throw new Error('cannot rotate a revoked share');
    const ttlSeconds = existing.expiresAt
      ? Math.max(1, Math.floor((new Date(existing.expiresAt).getTime() - now.getTime()) / 1000))
      : null;
    const token = this.sign({
      uid: existing.userId,
      sid: existing.id,
      s: existing.scopes,
      iat: Math.floor(now.getTime() / 1000),
      exp: ttlSeconds ? Math.floor(now.getTime() / 1000) + ttlSeconds : null,
      jti: b64url(randomBytes(8)),
    });
    existing.tokenSignature = token.split('.')[1]!.slice(-16);
    return { share: existing, token };
  }

  revoke(shareId: string, now: Date = new Date()): boolean {
    const existing = this.shares.get(shareId);
    if (!existing) return false;
    existing.revokedAt = now.toISOString();
    return true;
  }

  /**
   * Purge every share owned by a user. Used by the GDPR right-to-erasure
   * endpoint (DELETE /me) so caregiver tokens issued by the deleted user
   * stop verifying immediately, even before garbage collection of the
   * in-memory map. Returns the number of shares removed so the caller can
   * report it to the user and record it in the deletion tombstone.
   */
  purgeUser(userId: string): number {
    let removed = 0;
    for (const [sid, share] of this.shares) {
      if (share.userId === userId) {
        this.shares.delete(sid);
        removed += 1;
      }
    }
    return removed;
  }

  list(userId: string): CaregiverShareRecord[] {
    return Array.from(this.shares.values()).filter((s) => s.userId === userId);
  }

  get(shareId: string): CaregiverShareRecord | undefined {
    return this.shares.get(shareId);
  }

  /** Verify a token and check that all required scopes are granted. */
  verify(token: string, requiredScopes: CaregiverScope[] = [], now: Date = new Date()): VerifyResult | VerifyFailure {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid_format' };
    const [payloadB64, sigB64] = parts;
    const expectedSig = this.hmac(payloadB64!);
    const provided = b64urlDecode(sigB64!);
    if (provided.length !== expectedSig.length || !timingSafeEqual(provided, expectedSig)) {
      return { ok: false, reason: 'bad_signature' };
    }
    let payload: TokenPayload;
    try {
      payload = JSON.parse(b64urlDecode(payloadB64!).toString('utf8')) as TokenPayload;
    } catch {
      return { ok: false, reason: 'invalid_format' };
    }
    const share = this.shares.get(payload.sid);
    if (!share) return { ok: false, reason: 'unknown_share' };
    if (share.revokedAt) return { ok: false, reason: 'revoked' };
    if (payload.exp && payload.exp * 1000 < now.getTime()) return { ok: false, reason: 'expired' };
    for (const need of requiredScopes) {
      if (!share.scopes.includes(need)) return { ok: false, reason: 'scope_denied' };
    }
    return { ok: true, payload, share };
  }

  private sign(payload: TokenPayload): string {
    const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
    const sig = b64url(this.hmac(payloadB64));
    return `${payloadB64}.${sig}`;
  }

  private hmac(input: string): Buffer {
    return createHmac('sha256', this.secret).update(input).digest();
  }

  private normalizeScopes(scopes: CaregiverScope[]): CaregiverScope[] {
    const set = new Set<CaregiverScope>();
    for (const s of scopes) if (ALL_SCOPES.includes(s)) set.add(s);
    if (!set.size) set.add('view-meds');
    return ALL_SCOPES.filter((s) => set.has(s));
  }
}
