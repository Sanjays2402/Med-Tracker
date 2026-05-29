import type { FastifyInstance } from 'fastify';

/** Routes for medications-id. */
export async function registerMedicationsId(app: FastifyInstance) {
  app.get('/medications/:id', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications-id', method: 'get', path: '/medications/:id', echo: req.params });
  });
  app.patch('/medications/:id', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications-id', method: 'patch', path: '/medications/:id', echo: req.params });
  });
  app.delete('/medications/:id', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications-id', method: 'delete', path: '/medications/:id', echo: req.params });
  });
}
