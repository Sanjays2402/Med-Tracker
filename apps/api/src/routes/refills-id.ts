import type { FastifyInstance } from 'fastify';

/** Routes for refills-id. */
export async function registerRefillsId(app: FastifyInstance) {
  app.get('/refills/:id', {
    schema: { tags: ['refills'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'refills-id', method: 'get', path: '/refills/:id', echo: req.params });
  });
  app.patch('/refills/:id', {
    schema: { tags: ['refills'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'refills-id', method: 'patch', path: '/refills/:id', echo: req.params });
  });
  app.delete('/refills/:id', {
    schema: { tags: ['refills'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'refills-id', method: 'delete', path: '/refills/:id', echo: req.params });
  });
}
