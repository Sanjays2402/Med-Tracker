import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpRoot = mkdtempSync(join(tmpdir(), 'med-openapi-'));
process.env.NODE_ENV = 'test';
process.env.AUDIT_LOG_PATH = join(tmpRoot, 'audit.log');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';
process.env.OPENAPI_UI_ENABLED = 'true';

import { build } from '../src/server';

describe('OpenAPI documentation', () => {
  let app: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('GET /openapi.json returns a valid OpenAPI 3 document covering known routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const spec = res.json() as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, Record<string, { tags?: string[] }>>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Med-Tracker API');
    expect(typeof spec.info.version).toBe('string');

    // Should pick up routes the API actually registers, across several
    // route groups, proving @fastify/swagger ran with the routes attached.
    const paths = Object.keys(spec.paths);
    expect(paths).toEqual(expect.arrayContaining([
      '/livez',
      '/readyz',
      '/auth/login',
      '/auth/signup',
      '/me',
      '/me/export',
      '/medications',
      '/doses/today',
      '/admin/audit',
    ]));

    // Routes are tagged so the UI groups them sensibly.
    expect(spec.paths['/auth/login'].post?.tags).toContain('auth');
    expect(spec.paths['/medications'].get?.tags).toContain('medications');

    // Bearer security scheme is declared so "Try it out" can attach a JWT.
    expect(spec.components?.securitySchemes).toMatchObject({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
  });

  it('GET /docs serves Swagger UI when OPENAPI_UI_ENABLED is true', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/static/index.html' });
    expect([200, 302]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.headers['content-type']).toMatch(/html/);
    }
  });

  it('exposes a meaningful set of tags so docs are navigable', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { tags?: { name: string }[] };
    const names = (spec.tags ?? []).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'auth', 'me', 'medications', 'doses', 'caregivers', 'admin', 'health',
    ]));
  });
});
