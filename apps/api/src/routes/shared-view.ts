import type { FastifyInstance } from 'fastify';

/** Routes for shared-view. */
export async function registerSharedView(app: FastifyInstance) {
  app.get('/shared/view', {
    schema: { tags: ['shared'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'shared-view', method: 'get', path: '/shared/view', echo: req.params });
  });
}
