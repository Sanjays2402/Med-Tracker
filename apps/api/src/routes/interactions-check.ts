import type { FastifyInstance } from 'fastify';

/** Routes for interactions-check. */
export async function registerInteractionsCheck(app: FastifyInstance) {
  app.post('/interactions/check', {
    schema: { tags: ['interactions'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'interactions-check', method: 'post', path: '/interactions/check', echo: req.params });
  });
}
