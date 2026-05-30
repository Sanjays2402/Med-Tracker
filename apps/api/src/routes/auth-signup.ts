import type { FastifyInstance } from 'fastify';

/** Routes for auth-signup. */
export async function registerAuthSignup(app: FastifyInstance) {
  app.post('/auth/signup', {
    schema: { tags: ['auth'] },
    config: app.rateLimitTier('auth'),
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'auth-signup', method: 'post', path: '/auth/signup', echo: req.params });
  });
}
