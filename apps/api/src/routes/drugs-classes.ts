import type { FastifyInstance } from 'fastify';

/** Routes for drugs-classes. */
export async function registerDrugsClasses(app: FastifyInstance) {
  app.get('/drugs/classes', {
    schema: { tags: ['drugs'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'drugs-classes', method: 'get', path: '/drugs/classes', echo: req.params });
  });
}
