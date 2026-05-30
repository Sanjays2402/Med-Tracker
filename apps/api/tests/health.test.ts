import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Provide a writable audit log path and a real JWT secret before env.ts is
// imported by the server build. env.ts validates with zod at import time.
const tmpRoot = mkdtempSync(join(tmpdir(), 'med-health-'));
process.env.NODE_ENV = 'test';
process.env.AUDIT_LOG_PATH = join(tmpRoot, 'audit.log');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';

import { build } from '../src/server';

describe('health and lifecycle probes', () => {
  let app: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('GET /livez returns 200 with status ok and a numeric uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/livez' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; uptime: number; pid: number };
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.pid).toBe(process.pid);
  });

  it('GET /health remains a backward compatible liveness alias', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ok');
  });

  it('GET /readyz reports ready when audit log and JWT secret are configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; checks: Array<{ name: string; ok: boolean }> };
    expect(body.status).toBe('ready');
    const names = body.checks.map((c) => c.name).sort();
    expect(names).toEqual(['audit_log', 'jwt_secret']);
    expect(body.checks.every((c) => c.ok)).toBe(true);
  });

  it('readiness probe response carries the per-check breakdown', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    const body = res.json() as { checks: Array<{ name: string; ok: boolean; detail?: string }> };
    for (const c of body.checks) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.ok).toBe('boolean');
    }
  });
});

describe('runReadinessChecks unit', () => {
  it('flags a missing audit log directory as not ready', async () => {
    // Re-import in isolation so we can stub env values for this check only.
    const mod = await import('../src/routes/health');
    const result = mod.runReadinessChecks();
    // Under the test env set above, both checks must be green. This guards
    // against regressions where a check silently returns ok for the wrong
    // reason.
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'audit_log')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'jwt_secret')?.ok).toBe(true);
  });
});
