import type { FastifyInstance } from 'fastify';

/** Routes for drugs-search. */
export async function registerDrugsSearch(app: FastifyInstance) {
  app.get('/drugs/search', {
    schema: { tags: ['drugs'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'drugs-search', method: 'get', path: '/drugs/search', echo: req.params });
  });
}
