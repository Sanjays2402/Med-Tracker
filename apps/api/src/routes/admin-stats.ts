import type { FastifyInstance } from 'fastify';

/**
 * GET /admin/stats
 *
 * Admin only. Operational counters intended for the platform team. Gated
 * by the same JWT role check used by the rest of /admin/*.
 */
export async function registerAdminStats(app: FastifyInstance) {
  app.get(
    '/admin/stats',
    { schema: { tags: ['admin'] }, config: app.rateLimitTier('admin'), preHandler: app.requireRole('admin') },
    async (req, reply) => {
      return reply.send({
        ok: true,
        resource: 'admin-stats',
        actor: req.authUser?.sub ?? null,
        uptimeSeconds: Math.floor(process.uptime()),
      });
    },
  );
}
