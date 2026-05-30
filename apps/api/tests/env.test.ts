import { describe, it, expect } from 'vitest';
import { parseEnv } from '../src/env';

/**
 * Coverage for the zod-validated environment loader. Each case calls parseEnv
 * with an isolated env object so we do not mutate the real process.env that
 * other tests rely on.
 */
describe('env validation', () => {
  it('accepts an empty environment by applying safe defaults for development', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.JWT_SECRET).toBe('dev-secret-change-me');
    expect(env.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0);
    // SENTRY_ENVIRONMENT defaults to NODE_ENV when unset.
    expect(env.SENTRY_ENVIRONMENT).toBe('development');
  });

  it('coerces numeric PORT and SENTRY_TRACES_SAMPLE_RATE from strings', () => {
    const env = parseEnv({ PORT: '8080', SENTRY_TRACES_SAMPLE_RATE: '0.25' });
    expect(env.PORT).toBe(8080);
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.25);
  });

  it('rejects an out of range PORT', () => {
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a non URL WEB_ORIGIN', () => {
    expect(() => parseEnv({ WEB_ORIGIN: 'not a url' })).toThrow(/WEB_ORIGIN/);
  });

  it('rejects a sample rate above 1', () => {
    expect(() => parseEnv({ SENTRY_TRACES_SAMPLE_RATE: '2' })).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
  });

  it('blocks the dev JWT secret in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-secret-change-me',
        WEB_ORIGIN: 'https://app.example.com',
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it('requires a long JWT secret in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'short',
        WEB_ORIGIN: 'https://app.example.com',
      }),
    ).toThrow(/at least 32 characters/);
  });

  it('blocks localhost WEB_ORIGIN in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(40),
        WEB_ORIGIN: 'https://localhost:3000',
      }),
    ).toThrow(/WEB_ORIGIN.*localhost/);
  });

  it('requires https for WEB_ORIGIN in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(40),
        WEB_ORIGIN: 'http://app.example.com',
      }),
    ).toThrow(/https/);
  });

  it('permits cluster-internal http origins in production', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(40),
      WEB_ORIGIN: 'http://web.default.svc.cluster.local',
    });
    expect(env.NODE_ENV).toBe('production');
  });

  it('rejects a short ADMIN_TOKEN in production when set', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(40),
        WEB_ORIGIN: 'https://app.example.com',
        ADMIN_TOKEN: 'too-short',
      }),
    ).toThrow(/ADMIN_TOKEN/);
  });

  it('accepts a fully configured production environment', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      PORT: '4000',
      JWT_SECRET: 'x'.repeat(48),
      WEB_ORIGIN: 'https://app.example.com',
      DATABASE_URL: 'postgres://user:pass@db:5432/med',
      ADMIN_TOKEN: 'a'.repeat(32),
      SENTRY_DSN: 'https://abc@o0.ingest.sentry.io/1',
      SENTRY_TRACES_SAMPLE_RATE: '0.1',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.SENTRY_ENVIRONMENT).toBe('production');
    expect(env.ADMIN_TOKEN.length).toBe(32);
  });

  it('aggregates multiple validation problems into one error message', () => {
    try {
      parseEnv({ PORT: '-1', WEB_ORIGIN: 'nope', SENTRY_TRACES_SAMPLE_RATE: '5' });
      throw new Error('parseEnv should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/PORT/);
      expect(msg).toMatch(/WEB_ORIGIN/);
      expect(msg).toMatch(/SENTRY_TRACES_SAMPLE_RATE/);
    }
  });
});
