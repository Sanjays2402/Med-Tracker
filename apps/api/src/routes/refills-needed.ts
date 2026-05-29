import type { FastifyInstance } from 'fastify';

/** Routes for refills-needed. */
export async function registerRefillsNeeded(app: FastifyInstance) {
  app.get('/refills/needed', {
    schema: { tags: ['refills'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'refills-needed', method: 'get', path: '/refills/needed', echo: req.params });
  });
}
