import type { FastifyInstance } from 'fastify';

/** Routes for auth-refresh. */
export async function registerAuthRefresh(app: FastifyInstance) {
  app.post('/auth/refresh', {
    schema: { tags: ['auth'] },
    config: app.rateLimitTier('auth'),
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'auth-refresh', method: 'post', path: '/auth/refresh', echo: req.params });
  });
}
