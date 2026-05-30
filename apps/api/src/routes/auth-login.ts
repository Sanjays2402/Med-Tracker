import type { FastifyInstance } from 'fastify';

/** Routes for auth-login. */
export async function registerAuthLogin(app: FastifyInstance) {
  app.post('/auth/login', {
    schema: { tags: ['auth'] },
    config: app.rateLimitTier('auth'),
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'auth-login', method: 'post', path: '/auth/login', echo: req.params });
  });
}
