import type { FastifyInstance } from 'fastify';

/** Routes for admin-stats. */
export async function registerAdminStats(app: FastifyInstance) {
  app.get('/admin/stats', {
    schema: { tags: ['admin'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'admin-stats', method: 'get', path: '/admin/stats', echo: req.params });
  });
}
