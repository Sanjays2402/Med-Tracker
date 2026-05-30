import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { registerRoutes } from './routes';
import { env } from './env';
import requestIdPlugin from './plugins/requestId';
import loggingPlugin from './plugins/logging';
import metricsPlugin from './plugins/metrics';
import auditPlugin from './plugins/audit';
import sentryPlugin from './plugins/sentry';
import authPlugin from './plugins/auth';
import tenantPlugin from './plugins/tenant';
import rateLimitPlugin from './plugins/rateLimit';
import openapiPlugin from './plugins/openapi';

export async function build() {
  const isProd = env.NODE_ENV === 'production';
  const app = Fastify({
    // Use pino-pretty in dev only; production emits structured JSON for log
    // aggregation (Loki, CloudWatch, Datadog, etc.).
    logger: isProd
      ? { level: env.LOG_LEVEL }
      : { level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } },
    // Disable Fastify's built-in request/response log lines; our logging
    // plugin emits a single structured `request_completed` event instead.
    disableRequestLogging: true,
  });
  await app.register(requestIdPlugin);
  await app.register(loggingPlugin);
  await app.register(metricsPlugin);
  await app.register(auditPlugin);
  await app.register(sentryPlugin);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(helmet);
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(authPlugin);
  // Tenant context derives from JWT claims populated by auth, so it must
  // register after auth and before routes that call app.requireTenant().
  await app.register(tenantPlugin);
  // Rate limiting must register after auth so the keyGenerator can read
  // req.authUser populated by per-route authenticate preHandlers.
  await app.register(rateLimitPlugin);
  // OpenAPI must be registered before routes so @fastify/swagger can
  // observe every route schema as it is added.
  await app.register(openapiPlugin);
  await registerRoutes(app);
  return app;
}

if (require.main === module) {
  build()
    .then((app) => app.listen({ port: env.PORT, host: '0.0.0.0' }))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
