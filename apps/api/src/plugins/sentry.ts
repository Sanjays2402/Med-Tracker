import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, FastifyError } from 'fastify';
import * as Sentry from '@sentry/node';

/**
 * Sentry error tracking plugin.
 *
 * Initialises the Sentry Node SDK when SENTRY_DSN is set, captures exceptions
 * raised in route handlers with request scope (request id, method, route,
 * user id) and forwards uncaughtException / unhandledRejection events. When
 * SENTRY_DSN is empty the plugin still installs the Fastify error handler so
 * 500 responses stay consistent, but it skips Sentry initialisation so tests
 * and local dev never need network access or a DSN.
 */

let initialised = false;

function initSentryOnce(dsn: string, env: string, release: string | undefined, tracesSampleRate: number) {
  if (initialised) return;
  Sentry.init({
    dsn,
    environment: env,
    release,
    tracesSampleRate,
    // We capture errors explicitly from the Fastify error handler so the
    // default integrations do not need to monkey patch http. Keep the
    // standard set of integrations otherwise (contextLines, onUncaught,
    // onUnhandledRejection are all useful for an API).
    defaultIntegrations: undefined,
  });
  initialised = true;
}

/** Reset module level Sentry init state. Test only. */
export function _resetSentryForTests() {
  initialised = false;
  // Close any active client so a re-init in tests does not double publish.
  const client = Sentry.getClient();
  if (client) {
    void client.close(0);
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  const dsn = (process.env.SENTRY_DSN ?? '').trim();
  const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';
  const release = process.env.SENTRY_RELEASE?.trim() || undefined;
  const sampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0');

  const enabled = dsn.length > 0;
  if (enabled) {
    initSentryOnce(dsn, environment, release, Number.isFinite(sampleRate) ? sampleRate : 0);
    app.log.info({ msg: 'sentry_initialised', environment, release: release ?? null });
  } else {
    app.log.info({ msg: 'sentry_disabled', reason: 'SENTRY_DSN not set' });
  }

  app.decorate('sentryEnabled', enabled);

  function capture(err: Error, req: FastifyRequest) {
    if (!enabled) return;
    const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
    Sentry.withScope((scope) => {
      scope.setTag('request_id', req.id);
      scope.setTag('http.method', req.method);
      scope.setTag('http.route', route);
      const user = (req as unknown as { user?: { sub?: string; id?: string; email?: string } }).user;
      if (user && (user.sub || user.id)) {
        scope.setUser({ id: user.sub ?? user.id, email: user.email });
      }
      scope.setContext('request', {
        url: req.url,
        method: req.method,
        route,
        request_id: req.id,
        ip: req.ip,
      });
      Sentry.captureException(err);
    });
  }

  // Install a single error handler that captures the error to Sentry and
  // returns a sanitised JSON envelope. Fastify validation errors (statusCode
  // 4xx) are NOT forwarded to Sentry.
  app.setErrorHandler(async (err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err, reqId: req.id, route: req.routeOptions?.url ?? req.url }, 'request_failed');
      capture(err, req);
    } else {
      req.log.warn({ err: { message: err.message, code: err.code }, reqId: req.id }, 'request_rejected');
    }
    return reply.status(status).send({
      error: status >= 500 ? 'internal_server_error' : (err.code ?? 'bad_request'),
      message: status >= 500 ? 'Internal server error' : err.message,
      request_id: req.id,
    });
  });

  // Make sure pending events are flushed during graceful shutdown so we do
  // not drop the last few errors when k8s sends SIGTERM.
  app.addHook('onClose', async () => {
    if (enabled) {
      await Sentry.flush(2000);
    }
  });
};

export default fp(plugin, { name: 'sentry' });

declare module 'fastify' {
  interface FastifyInstance {
    sentryEnabled: boolean;
  }
}
