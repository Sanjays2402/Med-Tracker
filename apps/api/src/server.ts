import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { registerRoutes } from './routes';
import { env } from './env';

export async function build() {
  const app = Fastify({
    logger: { transport: { target: 'pino-pretty' } },
  });
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
