import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpRoot = mkdtempSync(join(tmpdir(), 'med-ratelimit-'));
process.env.NODE_ENV = 'test';
process.env.AUDIT_LOG_PATH = join(tmpRoot, 'audit.log');
process.env.JWT_SECRET = 'test-secret-at-least-sixteen-chars';

import { build } from '../src/server';
import { RATE_LIMIT_TIERS, authAwareKey } from '../src/plugins/rateLimit';

describe('rate limit plugin', () => {
  let app: Awaited<ReturnType<typeof build>>;

  beforeAll(async () => {
    app = await build();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('exposes the rate limit tier table with sensible per-window caps', () => {
    expect(RATE_LIMIT_TIERS.default.max).toBeGreaterThan(RATE_LIMIT_TIERS.auth.max);
    expect(RATE_LIMIT_TIERS.auth.max).toBeLessThanOrEqual(20);
    expect(RATE_LIMIT_TIERS.export.timeWindow).toMatch(/hour/);
    expect(RATE_LIMIT_TIERS.heavy.max).toBeLessThan(RATE_LIMIT_TIERS.default.max);
  });

  it('keyGenerator prefers JWT subject, then x-api-key, then client IP', () => {
    const userKey = authAwareKey({
      authUser: { sub: 'u-123', role: 'user' },
      headers: {},
      ip: '1.2.3.4',
    } as never);
    expect(userKey).toBe('user:u-123');

    const apiKey = authAwareKey({
      authUser: undefined,
      headers: { 'x-api-key': 'sk_live_abcdef' },
      ip: '1.2.3.4',
    } as never);
    expect(apiKey).toBe('key:sk_live_abcdef');

    const ipKey = authAwareKey({
      authUser: undefined,
      headers: {},
      ip: '9.9.9.9',
    } as never);
    expect(ipKey).toBe('ip:9.9.9.9');
  });

  it('throttles /auth/login after the auth tier max is reached and emits the rate_limited envelope', async () => {
    const max = RATE_LIMIT_TIERS.auth.max;
    let lastStatus = 0;
    let lastBody: { error?: string; tier?: string; retryAfterMs?: number } = {};
    for (let i = 0; i < max + 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-forwarded-for': '203.0.113.42' },
        payload: {},
      });
      lastStatus = res.statusCode;
      lastBody = res.json();
      if (res.statusCode === 429) break;
    }
    expect(lastStatus).toBe(429);
    expect(lastBody.error).toBe('rate_limited');
    expect(lastBody.tier).toBe('auth');
    expect(typeof lastBody.retryAfterMs).toBe('number');
  });

  it('allows /livez to bypass rate limiting so probes never get throttled', async () => {
    for (let i = 0; i < RATE_LIMIT_TIERS.default.max + 5; i++) {
      const res = await app.inject({ method: 'GET', url: '/livez' });
      expect(res.statusCode).toBe(200);
    }
  });

  it('exposes http_rate_limit_exceeded_total in /metrics after a breach', async () => {
    // Force a breach against the heavy tier from a fresh IP so we exercise
    // the metric increment path even if a previous test consumed budget.
    const max = RATE_LIMIT_TIERS.heavy.max;
    for (let i = 0; i < max + 2; i++) {
      await app.inject({
        method: 'POST',
        url: '/pills/identify',
        headers: { 'x-forwarded-for': '198.51.100.7' },
        payload: { shape: 'round', color: 'white' },
      });
    }
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain('http_rate_limit_exceeded_total');
  });
});
