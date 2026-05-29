import type { FastifyInstance } from 'fastify';

/** Routes for medications-id-archive. */
export async function registerMedicationsIdArchive(app: FastifyInstance) {
  app.post('/medications/:id/archive', {
    schema: { tags: ['medications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'medications-id-archive', method: 'post', path: '/medications/:id/archive', echo: req.params });
  });
}
