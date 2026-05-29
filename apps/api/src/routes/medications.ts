import type { FastifyInstance } from 'fastify';

/** Routes for medications. */
export async function registerMedications(app: FastifyInstance) {
  app.get('/medications', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications', method: 'get', path: '/medications', echo: req.params });
  });
  app.post('/medications', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications', method: 'post', path: '/medications', echo: req.params });
  });
}
