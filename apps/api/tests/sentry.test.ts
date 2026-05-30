import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '../src/server';
import { _resetSentryForTests } from '../src/plugins/sentry';

describe('sentry error tracking', () => {
  beforeEach(() => {
    delete process.env.SENTRY_DSN;
    _resetSentryForTests();
  });
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    _resetSentryForTests();
  });

  it('runs with sentry disabled when no DSN is set', async () => {
    const app = await build();
    try {
      expect(app.sentryEnabled).toBe(false);
      // Sanity: a normal request still works.
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('initialises Sentry when SENTRY_DSN is set', async () => {
    // Use a syntactically valid DSN. The transport will fail to deliver but
    // init succeeds and that is all we are asserting.
    process.env.SENTRY_DSN = 'https://public@o0.ingest.sentry.io/0';
    const app = await build();
    try {
      expect(app.sentryEnabled).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('error handler returns a sanitised 500 envelope with request id', async () => {
    const app = await build();
    app.get('/__sentry_test_throw', async () => {
      throw new Error('boom from test');
    });
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/__sentry_test_throw',
        headers: { 'x-request-id': 'test-req-id-1' },
      });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.error).toBe('internal_server_error');
      expect(body.message).toBe('Internal server error');
      expect(body.request_id).toBe('test-req-id-1');
      // The original error message must not leak into the response body.
      expect(JSON.stringify(body)).not.toContain('boom from test');
    } finally {
      await app.close();
    }
  });

  it('error handler preserves 4xx errors and does not mask their message', async () => {
    const app = await build();
    app.get('/__sentry_test_400', async () => {
      const err = new Error('missing required field foo') as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/__sentry_test_400' });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('missing required field foo');
      expect(typeof body.request_id).toBe('string');
    } finally {
      await app.close();
    }
  });
});
