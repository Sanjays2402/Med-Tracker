import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Audit log behaviour: every mutating request and every auth event is
 * appended to the JSONL trail; GET /admin/audit is gated on ADMIN_TOKEN
 * and rejects requests without it.
 */
describe('audit log', () => {
  let dir: string;
  let prevPath: string | undefined;
  let prevToken: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'med-audit-'));
    prevPath = process.env.AUDIT_LOG_PATH;
    prevToken = process.env.ADMIN_TOKEN;
    process.env.AUDIT_LOG_PATH = join(dir, 'audit.log');
    process.env.ADMIN_TOKEN = 'test-admin-token';
  });

  afterEach(() => {
    if (prevPath === undefined) delete process.env.AUDIT_LOG_PATH;
    else process.env.AUDIT_LOG_PATH = prevPath;
    if (prevToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = prevToken;
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists mutating requests as JSONL and serves them via /admin/audit', async () => {
    // Re-import after env is set so env.ts captures the new values.
    const { build } = await import('../src/server');
    const app = await build();
    try {
      // Trigger a mutating request and an auth event.
      const create = await app.inject({
        method: 'POST',
        url: '/medications',
        payload: { name: 'Ibuprofen', strength: '200 mg' },
      });
      expect(create.statusCode).toBe(201);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'a@b.test', password: 'x' },
      });
      expect(login.statusCode).toBe(200);

      // GET requests on non auth routes should NOT be audited.
      await app.inject({ method: 'GET', url: '/medications' });

      // Give the write stream a tick to flush.
      await new Promise((r) => setTimeout(r, 25));

      const logPath = process.env.AUDIT_LOG_PATH!;
      expect(existsSync(logPath)).toBe(true);
      const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const parsed = lines.map((l) => JSON.parse(l));
      const actions = parsed.map((e) => e.action);
      expect(actions).toContain('medications.create');
      expect(actions).toContain('auth.login');
      // No GET /medications entry.
      expect(actions).not.toContain('medications.read');

      for (const e of parsed) {
        expect(typeof e.ts).toBe('string');
        expect(typeof e.reqId).toBe('string');
        expect(typeof e.status).toBe('number');
        expect(['POST', 'PUT', 'PATCH', 'DELETE']).toContain(e.method);
      }

      // /admin/audit without the token must be rejected.
      const unauth = await app.inject({ method: 'GET', url: '/admin/audit' });
      expect(unauth.statusCode).toBe(401);

      // With the correct token, returns the entries newest first.
      const ok = await app.inject({
        method: 'GET',
        url: '/admin/audit',
        headers: { 'x-admin-token': 'test-admin-token' },
      });
      expect(ok.statusCode).toBe(200);
      const body = ok.json() as { entries: Array<{ action: string }>; count: number };
      expect(body.count).toBeGreaterThanOrEqual(2);
      const returnedActions = body.entries.map((e) => e.action);
      expect(returnedActions).toContain('medications.create');
      expect(returnedActions).toContain('auth.login');

      // Action filter narrows results.
      const filtered = await app.inject({
        method: 'GET',
        url: '/admin/audit?action=medications.create',
        headers: { 'x-admin-token': 'test-admin-token' },
      });
      expect(filtered.statusCode).toBe(200);
      const fbody = filtered.json() as { entries: Array<{ action: string }> };
      expect(fbody.entries.every((e) => e.action === 'medications.create')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('disables /admin/audit when ADMIN_TOKEN is unset', async () => {
    delete process.env.ADMIN_TOKEN;
    const { build } = await import('../src/server');
    const app = await build();
    try {
      const res = await app.inject({ method: 'GET', url: '/admin/audit' });
      expect(res.statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
});
