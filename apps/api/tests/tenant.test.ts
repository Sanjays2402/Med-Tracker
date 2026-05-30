import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Configure env before the server module (and src/env.ts) loads.
const tmpRoot = mkdtempSync(join(tmpdir(), 'med-tenant-'));
process.env.NODE_ENV = 'test';
process.env.AUDIT_LOG_PATH = join(tmpRoot, 'audit.log');
process.env.JWT_SECRET = 'tenant-test-secret-at-least-32-characters-long';

import { build } from '../src/server';

describe('tenant context plugin', () => {
  let app: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function signToken(payload: Record<string, unknown>): string {
    return (app as unknown as { jwt: { sign: (p: Record<string, unknown>) => string } }).jwt.sign(payload);
  }

  it('resolves tenant from the tid claim and returns it on /me/export when matching', async () => {
    // tid claim equals sub, so the resource owner check passes and the
    // resolved tenant flows into the export bundle.
    const token = signToken({ sub: 'user-a', role: 'user', tid: 'user-a' });
    const res = await app.inject({
      method: 'GET',
      url: '/me/export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { userId: string; tenantId: string };
    expect(body.userId).toBe('user-a');
    expect(body.tenantId).toBe('user-a');
  });

  it('falls back to sub as tenant when no tenant claim is present', async () => {
    const token = signToken({ sub: 'user-solo', role: 'user' });
    const res = await app.inject({
      method: 'GET',
      url: '/me/export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { userId: string; tenantId: string };
    expect(body.userId).toBe('user-solo');
    expect(body.tenantId).toBe('user-solo');
  });

  it('refuses cross tenant export when tid claim does not match user id', async () => {
    const token = signToken({ sub: 'user-b', role: 'user', tid: 'tenant-other' });
    const res = await app.inject({
      method: 'GET',
      url: '/me/export',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('tenant_mismatch');
  });

  it('refuses cross tenant delete when tid claim does not match user id', async () => {
    const token = signToken({ sub: 'user-c', role: 'user', tid: 'tenant-other' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('tenant_mismatch');
  });

  it('allows delete when tid matches user id and returns tenantId', async () => {
    const token = signToken({ sub: 'user-d', role: 'user', tid: 'user-d' });
    const res = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { userId: string; tenantId: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.userId).toBe('user-d');
    expect(body.tenantId).toBe('user-d');
  });

  it('rejects unauthenticated requests with 401 (requireTenant runs authenticate)', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/export' });
    expect(res.statusCode).toBe(401);
  });

  it('exposes the tenant denial counter via /metrics', async () => {
    // Trigger a denial.
    const token = signToken({ sub: 'user-e', role: 'user', tid: 'tenant-elsewhere' });
    await app.inject({
      method: 'GET',
      url: '/me/export',
      headers: { authorization: `Bearer ${token}` },
    });
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('http_tenant_access_denied_total');
  });
});
