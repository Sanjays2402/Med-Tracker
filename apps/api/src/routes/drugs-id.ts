import type { FastifyInstance } from 'fastify';

/** Routes for drugs-id. */
export async function registerDrugsId(app: FastifyInstance) {
  app.get('/drugs/:id', {
    schema: { tags: ['drugs'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'drugs-id', method: 'get', path: '/drugs/:id', echo: req.params });
  });
}
