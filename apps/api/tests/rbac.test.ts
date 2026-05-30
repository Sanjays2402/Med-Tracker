import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Configure environment before src/server.ts (and src/env.ts) load.
const tmpRoot = mkdtempSync(join(tmpdir(), 'med-rbac-'));
process.env.NODE_ENV = 'test';
process.env.AUDIT_LOG_PATH = join(tmpRoot, 'audit.log');
process.env.JWT_SECRET = 'rbac-test-secret-at-least-32-characters-long';

import { build } from '../src/server';

describe('RBAC on /admin routes', () => {
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

  it('GET /admin/users without any credentials returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthorized');
  });

  it('GET /admin/users with a non-admin JWT returns 403', async () => {
    const token = signToken({ sub: 'user-1', role: 'user' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');
  });

  it('GET /admin/users with an admin JWT returns 200 and echoes the actor', async () => {
    const token = signToken({ sub: 'admin-1', role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; actor: string };
    expect(body.ok).toBe(true);
    expect(body.actor).toBe('admin-1');
  });

  it('GET /admin/stats with admin JWT returns 200', async () => {
    const token = signToken({ sub: 'admin-2', role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { uptimeSeconds: number };
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('GET /admin/audit accepts admin JWT (no ADMIN_TOKEN configured)', async () => {
    const token = signToken({ sub: 'admin-3', role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { entries: unknown[]; count: number };
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.count).toBe('number');
  });

  it('GET /admin/audit with no credentials returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/audit' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/users with malformed bearer returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('dev-only x-user-id header grants user role (test env)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { 'x-user-id': 'dev-user', 'x-user-role': 'user' },
    });
    // user role, not admin
    expect(res.statusCode).toBe(403);
  });

  it('dev-only x-user-role=admin header grants admin (test env)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { 'x-user-id': 'dev-admin', 'x-user-role': 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { actor: string };
    expect(body.actor).toBe('dev-admin');
  });
});
