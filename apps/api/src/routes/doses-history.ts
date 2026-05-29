import type { FastifyInstance } from 'fastify';

/** Routes for doses-history. */
export async function registerDosesHistory(app: FastifyInstance) {
  app.get('/doses/history', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-history', method: 'get', path: '/doses/history', echo: req.params });
  });
}
