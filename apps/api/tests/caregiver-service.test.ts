import { describe, it, expect } from 'vitest';
import { CaregiverService } from '../src/services/CaregiverService';

const SECRET = 'a-secret-of-sufficient-length-32-chars';

describe('CaregiverService', () => {
  it('rejects short secrets', () => {
    expect(() => new CaregiverService('short')).toThrow(/16 characters/);
  });

  it('issues a share with a verifiable token', () => {
    const svc = new CaregiverService(SECRET);
    const { share, token } = svc.issue({ userId: 'u1', label: 'Daughter', scopes: ['view-meds'] });
    expect(share.userId).toBe('u1');
    expect(share.scopes).toEqual(['view-meds']);
    expect(token.split('.')).toHaveLength(2);
    const v = svc.verify(token);
    expect(v.ok).toBe(true);
  });

  it('normalizes invalid scopes and defaults to view-meds', () => {
    const svc = new CaregiverService(SECRET);
    const { share } = svc.issue({ userId: 'u1', label: 'L', scopes: ['nonsense' as any] });
    expect(share.scopes).toEqual(['view-meds']);
  });

  it('orders scopes deterministically and dedupes', () => {
    const svc = new CaregiverService(SECRET);
    const { share } = svc.issue({
      userId: 'u1', label: 'L',
      scopes: ['view-refills', 'view-meds', 'view-refills', 'view-adherence'],
    });
    expect(share.scopes).toEqual(['view-meds', 'view-adherence', 'view-refills']);
  });

  it('rejects bad signatures', () => {
    const svc = new CaregiverService(SECRET);
    const other = new CaregiverService('another-secret-of-sufficient-len');
    const { token } = svc.issue({ userId: 'u1', label: 'L', scopes: ['view-meds'] });
    // Re-register the share on the other instance so we get bad_signature
    // rather than unknown_share when the verifier runs.
    other.issue({ userId: 'u1', label: 'L', scopes: ['view-meds'] });
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'BB' : 'AA');
    expect(svc.verify(tampered).ok).toBe(false);
    expect(other.verify(token).ok).toBe(false);
  });

  it('rejects malformed tokens', () => {
    const svc = new CaregiverService(SECRET);
    const r = svc.verify('not.a.token');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_format');
  });

  it('honors expiry', () => {
    const svc = new CaregiverService(SECRET);
    const now = new Date('2026-05-29T12:00:00.000Z');
    const { token } = svc.issue({ userId: 'u1', label: 'L', scopes: ['view-meds'], ttlSeconds: 60, now });
    expect(svc.verify(token, [], new Date('2026-05-29T12:00:30.000Z')).ok).toBe(true);
    const later = svc.verify(token, [], new Date('2026-05-29T12:02:00.000Z'));
    expect(later.ok).toBe(false);
    if (!later.ok) expect(later.reason).toBe('expired');
  });

  it('enforces scope requirements', () => {
    const svc = new CaregiverService(SECRET);
    const { token } = svc.issue({ userId: 'u1', label: 'L', scopes: ['view-meds'] });
    const denied = svc.verify(token, ['view-adherence']);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('scope_denied');
  });

  it('revoke prevents subsequent verification', () => {
    const svc = new CaregiverService(SECRET);
    const { share, token } = svc.issue({ userId: 'u1', label: 'L', scopes: ['view-meds'] });
    expect(svc.revoke(share.id)).toBe(true);
    const r = svc.verify(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('revoked');
  });

  it('rotate yields a new token but keeps shareId and scopes', () => {
    const svc = new CaregiverService(SECRET);
    const issued = svc.issue({ userId: 'u1', label: 'L', scopes: ['view-meds', 'view-refills'] });
    const rotated = svc.rotate(issued.share.id);
    expect(rotated.share.id).toBe(issued.share.id);
    expect(rotated.share.scopes).toEqual(issued.share.scopes);
    expect(rotated.token).not.toBe(issued.token);
    expect(svc.verify(rotated.token).ok).toBe(true);
  });

  it('rotate refuses on revoked or missing shares', () => {
    const svc = new CaregiverService(SECRET);
    expect(() => svc.rotate('nope')).toThrow();
    const { share } = svc.issue({ userId: 'u1', label: 'L', scopes: ['view-meds'] });
    svc.revoke(share.id);
    expect(() => svc.rotate(share.id)).toThrow(/revoked/);
  });

  it('list returns only the requested user shares', () => {
    const svc = new CaregiverService(SECRET);
    svc.issue({ userId: 'u1', label: 'A', scopes: ['view-meds'] });
    svc.issue({ userId: 'u1', label: 'B', scopes: ['view-meds'] });
    svc.issue({ userId: 'u2', label: 'C', scopes: ['view-meds'] });
    expect(svc.list('u1')).toHaveLength(2);
    expect(svc.list('u2')).toHaveLength(1);
  });

  it('trims and clamps label length', () => {
    const svc = new CaregiverService(SECRET);
    const { share } = svc.issue({ userId: 'u', label: '  ' + 'x'.repeat(200) + '  ', scopes: ['view-meds'] });
    expect(share.label.length).toBeLessThanOrEqual(80);
  });
});
