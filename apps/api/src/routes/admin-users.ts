import type { FastifyInstance } from 'fastify';

/**
 * GET /admin/users
 *
 * Admin only. Requires a JWT bearer whose `role` claim equals 'admin'.
 * In non-production environments the x-user-id + x-user-role=admin
 * dev headers are also accepted (see plugins/auth.ts).
 */
export async function registerAdminUsers(app: FastifyInstance) {
  app.get(
    '/admin/users',
    { schema: { tags: ['admin'] }, preHandler: app.requireRole('admin') },
    async (req, reply) => {
      return reply.send({
        ok: true,
        resource: 'admin-users',
        actor: req.authUser?.sub ?? null,
      });
    },
  );
}
