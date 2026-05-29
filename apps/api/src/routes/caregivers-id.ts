import type { FastifyInstance } from 'fastify';

/** Routes for caregivers-id. */
export async function registerCaregiversId(app: FastifyInstance) {
  app.get('/caregivers/:id', {
    schema: { tags: ['caregivers'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'caregivers-id', method: 'get', path: '/caregivers/:id', echo: req.params });
  });
  app.delete('/caregivers/:id', {
    schema: { tags: ['caregivers'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'caregivers-id', method: 'delete', path: '/caregivers/:id', echo: req.params });
  });
}
