import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Structured request logging plugin.
 *
 * Emits a single `request_completed` log line per request at info level with
 * method, route, status, duration_ms, and request id. Health and metrics
 * endpoints are intentionally logged at debug level to keep production
 * dashboards readable.
 */
const QUIET_ROUTES = new Set(['/health', '/ready', '/metrics']);

const plugin: FastifyPluginAsync = async (app) => {
  const starts = new WeakMap<object, bigint>();

  app.addHook('onRequest', async (req) => {
    starts.set(req, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (req, reply) => {
    const start = starts.get(req);
    const durationMs = start ? Number(process.hrtime.bigint() - start) / 1e6 : 0;
    const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
    const payload = {
      msg: 'request_completed',
      reqId: req.id,
      method: req.method,
      route,
      status: reply.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
    };
    if (QUIET_ROUTES.has(route)) {
      req.log.debug(payload);
    } else {
      req.log.info(payload);
    }
  });
};

export default fp(plugin, { name: 'logging' });
