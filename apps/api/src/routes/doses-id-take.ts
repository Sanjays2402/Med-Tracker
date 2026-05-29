import type { FastifyInstance } from 'fastify';

/** Routes for doses-id-take. */
export async function registerDosesIdTake(app: FastifyInstance) {
  app.post('/doses/:id/take', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-id-take', method: 'post', path: '/doses/:id/take', echo: req.params });
  });
}
