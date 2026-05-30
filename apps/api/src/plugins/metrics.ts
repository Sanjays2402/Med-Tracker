import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import client from 'prom-client';

/**
 * Prometheus metrics plugin.
 *
 * Collects default Node.js process metrics plus per-request HTTP histograms and
 * a counter, then exposes them at `GET /metrics` in the standard text exposition
 * format. The `/metrics` route itself is excluded from the request histograms
 * so scrape traffic does not pollute latency stats.
 */
const plugin: FastifyPluginAsync = async (app) => {
  const registry = new client.Registry();
  registry.setDefaultLabels({ service: 'med-api' });
  client.collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests processed',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const startTimes = new WeakMap<FastifyRequest, bigint>();

  app.addHook('onRequest', async (req) => {
    startTimes.set(req, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
    if (url === '/metrics') return;
    const start = startTimes.get(req);
    if (start === undefined) return;
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: url,
      status_code: String(reply.statusCode),
    };
    httpRequestDuration.observe(labels, seconds);
    httpRequestsTotal.inc(labels);
  });

  app.get('/metrics', { logLevel: 'warn' }, async (_req, reply) => {
    reply.header('content-type', registry.contentType);
    return registry.metrics();
  });

  app.decorate('metricsRegistry', registry);
};

declare module 'fastify' {
  interface FastifyInstance {
    metricsRegistry: client.Registry;
  }
}

export default fp(plugin, { name: 'metrics' });
