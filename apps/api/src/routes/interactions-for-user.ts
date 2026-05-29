import type { FastifyInstance } from 'fastify';

/** Routes for interactions-for-user. */
export async function registerInteractionsForUser(app: FastifyInstance) {
  app.get('/interactions/for/user', {
    schema: { tags: ['interactions'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'interactions-for-user', method: 'get', path: '/interactions/for/user', echo: req.params });
  });
}
