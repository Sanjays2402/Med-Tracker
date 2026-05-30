import { describe, it, expect } from 'vitest';
import { build } from '../src/server';

describe('observability', () => {
  it('exposes a Prometheus /metrics endpoint with default + custom metrics', async () => {
    const app = await build();
    try {
      // Generate one request so the http_requests_total counter has a sample.
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);

      const res = await app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      const body = res.body;
      // Default Node process metrics.
      expect(body).toMatch(/process_cpu_user_seconds_total/);
      expect(body).toMatch(/nodejs_heap_size_total_bytes/);
      // Our custom HTTP metrics, with the service label set.
      expect(body).toMatch(/http_requests_total\{[^}]*service="med-api"[^}]*\}/);
      expect(body).toMatch(/http_request_duration_seconds_bucket/);
      // The /metrics scrape itself must be excluded from histograms.
      expect(body).not.toMatch(/route="\/metrics"/);
    } finally {
      await app.close();
    }
  });

  it('propagates x-request-id when inbound and generates one otherwise', async () => {
    const app = await build();
    try {
      const provided = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-request-id': 'abc-123_test' },
      });
      expect(provided.headers['x-request-id']).toBe('abc-123_test');

      const generated = await app.inject({ method: 'GET', url: '/health' });
      const rid = generated.headers['x-request-id'];
      expect(typeof rid).toBe('string');
      expect(rid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      // Reject unsafe inbound ids by falling back to a fresh uuid.
      const unsafe = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-request-id': 'evil id with spaces and $$' },
      });
      expect(unsafe.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    } finally {
      await app.close();
    }
  });
});
