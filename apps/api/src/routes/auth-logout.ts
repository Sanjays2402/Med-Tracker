import type { FastifyInstance } from 'fastify';

/** Routes for auth-logout. */
export async function registerAuthLogout(app: FastifyInstance) {
  app.post('/auth/logout', {
    schema: { tags: ['auth'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'auth-logout', method: 'post', path: '/auth/logout', echo: req.params });
  });
}
