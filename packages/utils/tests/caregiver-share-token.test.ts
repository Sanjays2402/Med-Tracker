import { describe, it, expect } from 'vitest';
import {
  decodeTokenUnsafe,
  issueCaregiverShareToken,
  verifyCaregiverShareToken,
  type IssueTokenInput,
} from '../src/caregiver-share-token';

const SECRET = 'a-very-long-server-side-secret-of-at-least-32-bytes-yes-really';
const OTHER_SECRET = 'a-totally-different-server-side-secret-of-at-least-32-bytes-yes';
const SHARE: IssueTokenInput['share'] = {
  id: '11111111-2222-3333-4444-555555555555',
  scopes: ['view-meds', 'view-adherence'],
  expiresAt: null,
};

describe('issueCaregiverShareToken', () => {
  it('emits a string that starts with the mtks_ prefix', async () => {
    const t = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    expect(t.startsWith('mtks_')).toBe(true);
    expect(t.split('.').length).toBe(2);
  });

  it('rejects too-short secrets', async () => {
    await expect(
      issueCaregiverShareToken({ share: SHARE, secret: 'too-short' }),
    ).rejects.toThrow(/at least 32/);
  });

  it('rejects expiry not after issued-at', async () => {
    const issuedAt = new Date('2026-06-20T10:00:00Z');
    await expect(
      issueCaregiverShareToken({
        share: SHARE,
        secret: SECRET,
        issuedAt,
        expiresAt: issuedAt, // equal -> reject
      }),
    ).rejects.toThrow(/expiresAt/);
  });

  it('two issues for the same share at the same instant produce the same token', async () => {
    const issuedAt = new Date('2026-06-20T10:00:00Z');
    const a = await issueCaregiverShareToken({ share: SHARE, secret: SECRET, issuedAt });
    const b = await issueCaregiverShareToken({ share: SHARE, secret: SECRET, issuedAt });
    expect(a).toBe(b);
  });

  it('produces different tokens for different issued-at instants', async () => {
    const a = await issueCaregiverShareToken({
      share: SHARE, secret: SECRET, issuedAt: new Date('2026-06-20T10:00:00Z'),
    });
    const b = await issueCaregiverShareToken({
      share: SHARE, secret: SECRET, issuedAt: new Date('2026-06-20T10:00:01Z'),
    });
    expect(a).not.toBe(b);
  });

  it('honours explicit expiresAt over share.expiresAt', async () => {
    const shareLong: IssueTokenInput['share'] = {
      ...SHARE,
      expiresAt: '2030-01-01T00:00:00Z',
    };
    const shortExpiry = new Date('2026-06-21T10:00:00Z');
    const token = await issueCaregiverShareToken({
      share: shareLong,
      secret: SECRET,
      issuedAt: new Date('2026-06-20T10:00:00Z'),
      expiresAt: shortExpiry,
    });
    const decoded = decodeTokenUnsafe(token)!;
    expect(decoded.expiresAt?.toISOString()).toBe(shortExpiry.toISOString());
  });
});

describe('verifyCaregiverShareToken', () => {
  it('round-trips share id, scopes, issued-at, expiry', async () => {
    const issuedAt = new Date('2026-06-20T10:00:00Z');
    const expiresAt = new Date('2026-12-20T10:00:00Z');
    const token = await issueCaregiverShareToken({
      share: SHARE, secret: SECRET, issuedAt, expiresAt,
    });
    const result = await verifyCaregiverShareToken({
      token, secret: SECRET, now: new Date('2026-09-01T00:00:00Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shareId).toBe(SHARE.id);
    expect(result.scopes).toEqual(['view-meds', 'view-adherence']);
    expect(result.issuedAt.toISOString()).toBe(issuedAt.toISOString());
    expect(result.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
  });

  it('verifies a token with no expiry', async () => {
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    const result = await verifyCaregiverShareToken({ token, secret: SECRET });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAt).toBeNull();
  });

  it('reports expired when current time is past exp', async () => {
    const token = await issueCaregiverShareToken({
      share: SHARE, secret: SECRET,
      issuedAt: new Date('2026-06-20T10:00:00Z'),
      expiresAt: new Date('2026-06-20T11:00:00Z'),
    });
    const result = await verifyCaregiverShareToken({
      token, secret: SECRET, now: new Date('2026-06-20T11:00:01Z'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('expired');
  });

  it('reports signature-mismatch when secret differs', async () => {
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    const result = await verifyCaregiverShareToken({ token, secret: OTHER_SECRET });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('signature-mismatch');
  });

  it('reports signature-mismatch when payload is tampered', async () => {
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    // Re-encode the payload with an extra scope and re-attach the original sig.
    const [head, sig] = token.slice('mtks_'.length).split('.');
    const padLen = (4 - (head!.length % 4)) % 4;
    const headStd = head!.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
    const orig = JSON.parse(atob(headStd));
    orig.scp.push('vr');
    const tamperedBin = JSON.stringify(orig);
    const tamperedPayload = btoa(tamperedBin)
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tampered = `mtks_${tamperedPayload}.${sig}`;
    const result = await verifyCaregiverShareToken({ token: tampered, secret: SECRET });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('signature-mismatch');
  });

  it('reports malformed for missing prefix', async () => {
    const result = await verifyCaregiverShareToken({ token: 'not-a-token', secret: SECRET });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed');
  });

  it('reports malformed for missing dot', async () => {
    const result = await verifyCaregiverShareToken({
      token: 'mtks_eyJhIjoxfQ',
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed');
  });

  it('reports malformed for unparsable payload', async () => {
    const result = await verifyCaregiverShareToken({
      token: 'mtks_$$.AAAA',
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('malformed');
  });

  it('reports secret-too-short before doing any HMAC work', async () => {
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    const result = await verifyCaregiverShareToken({ token, secret: 'too-short' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('secret-too-short');
  });

  it('tolerates 60s of clock skew on iat', async () => {
    const issuedAt = new Date('2026-06-20T10:00:00Z');
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET, issuedAt });
    // Verifier's clock is 30s behind the issuer.
    const result = await verifyCaregiverShareToken({
      token, secret: SECRET, now: new Date('2026-06-20T09:59:30Z'),
    });
    expect(result.ok).toBe(true);
  });

  it('reports not-yet-valid when iat is more than 60s in the future', async () => {
    const issuedAt = new Date('2026-06-20T10:05:00Z');
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET, issuedAt });
    const result = await verifyCaregiverShareToken({
      token, secret: SECRET, now: new Date('2026-06-20T10:00:00Z'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-yet-valid');
  });
});

describe('decodeTokenUnsafe', () => {
  it('reads the share id and scopes without checking the signature', async () => {
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    const decoded = decodeTokenUnsafe(token)!;
    expect(decoded.shareId).toBe(SHARE.id);
    expect(decoded.scopes).toEqual(['view-meds', 'view-adherence']);
    expect(decoded.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns null for malformed input', () => {
    expect(decodeTokenUnsafe('not-a-token')).toBeNull();
    expect(decodeTokenUnsafe('mtks_$$')).toBeNull();
  });

  it('fingerprint is stable across decode calls for the same token', async () => {
    const token = await issueCaregiverShareToken({ share: SHARE, secret: SECRET });
    const a = decodeTokenUnsafe(token)!;
    const b = decodeTokenUnsafe(token)!;
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('fingerprint differs across distinct tokens', async () => {
    const t1 = await issueCaregiverShareToken({
      share: SHARE, secret: SECRET, issuedAt: new Date('2026-06-20T10:00:00Z'),
    });
    const t2 = await issueCaregiverShareToken({
      share: SHARE, secret: SECRET, issuedAt: new Date('2026-06-20T10:00:05Z'),
    });
    expect(decodeTokenUnsafe(t1)!.fingerprint).not.toBe(decodeTokenUnsafe(t2)!.fingerprint);
  });
});
