import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { registerRoutes } from './routes';
import { env } from './env';
import requestIdPlugin from './plugins/requestId';
import loggingPlugin from './plugins/logging';
import metricsPlugin from './plugins/metrics';
import auditPlugin from './plugins/audit';
import sentryPlugin from './plugins/sentry';

export async function build() {
  const isProd = process.env.NODE_ENV === 'production';
  const app = Fastify({
    // Use pino-pretty in dev only; production emits structured JSON for log
    // aggregation (Loki, CloudWatch, Datadog, etc.).
    logger: isProd
      ? { level: process.env.LOG_LEVEL ?? 'info' }
      : { level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } },
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
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await app.register(jwt, { secret: env.JWT_SECRET });
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
