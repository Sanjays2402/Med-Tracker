import type { FastifyInstance } from 'fastify';

/** Routes for caregivers-id-rotate. */
export async function registerCaregiversIdRotate(app: FastifyInstance) {
  app.post('/caregivers/:id/rotate', {
    schema: { tags: ['caregivers'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'caregivers-id-rotate', method: 'post', path: '/caregivers/:id/rotate', echo: req.params });
  });
}
