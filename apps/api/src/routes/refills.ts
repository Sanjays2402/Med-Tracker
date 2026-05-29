import type { FastifyInstance } from 'fastify';

/** Routes for refills. */
export async function registerRefills(app: FastifyInstance) {
  app.get('/refills', {
    schema: { tags: ['refills'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'refills', method: 'get', path: '/refills', echo: req.params });
  });
  app.post('/refills', {
    schema: { tags: ['refills'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'refills', method: 'post', path: '/refills', echo: req.params });
  });
}
