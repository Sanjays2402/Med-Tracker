import type { FastifyInstance } from 'fastify';

/** Routes for admin-users. */
export async function registerAdminUsers(app: FastifyInstance) {
  app.get('/admin/users', {
    schema: { tags: ['admin'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'admin-users', method: 'get', path: '/admin/users', echo: req.params });
  });
}
