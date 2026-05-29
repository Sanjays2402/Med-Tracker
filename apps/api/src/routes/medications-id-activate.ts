import type { FastifyInstance } from 'fastify';

/** Routes for medications-id-activate. */
export async function registerMedicationsIdActivate(app: FastifyInstance) {
  app.post('/medications/:id/activate', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications-id-activate', method: 'post', path: '/medications/:id/activate', echo: req.params });
  });
}
