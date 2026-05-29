import type { FastifyInstance } from 'fastify';

/** Routes for me. */
export async function registerMe(app: FastifyInstance) {
  app.get('/me', {
    schema: { tags: ['me'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'me', method: 'get', path: '/me', echo: req.params });
  });
  app.patch('/me', {
    schema: { tags: ['me'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'me', method: 'patch', path: '/me', echo: req.params });
  });
}
