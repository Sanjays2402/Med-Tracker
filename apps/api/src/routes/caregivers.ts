import type { FastifyInstance } from 'fastify';

/** Routes for caregivers. */
export async function registerCaregivers(app: FastifyInstance) {
  app.get('/caregivers', {
    schema: { tags: ['caregivers'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'caregivers', method: 'get', path: '/caregivers', echo: req.params });
  });
  app.post('/caregivers', {
    schema: { tags: ['caregivers'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'caregivers', method: 'post', path: '/caregivers', echo: req.params });
  });
}
