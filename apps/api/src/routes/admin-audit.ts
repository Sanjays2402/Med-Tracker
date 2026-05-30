import type { FastifyInstance } from 'fastify';

/**
 * GET /admin/audit
 *
 * Query the persisted audit trail. Requires an x-admin-token header that
 * matches ADMIN_TOKEN. If ADMIN_TOKEN is unset the route is disabled and
 * returns 503 so a misconfigured deployment cannot leak the trail.
 *
 * Query params:
 *   actorId  filter by actor id
 *   action   filter by action verb
 *   since    ISO timestamp lower bound (inclusive)
 *   until    ISO timestamp upper bound (inclusive)
 *   limit    max entries returned, capped at 1000, default 200
 */
export async function registerAdminAudit(app: FastifyInstance) {
  app.get('/admin/audit', async (req, reply) => {
    const adminToken = process.env.ADMIN_TOKEN ?? '';
    if (!adminToken) {
      return reply.status(503).send({
        error: { code: 'admin_disabled', message: 'ADMIN_TOKEN is not configured' },
      });
    }
    const token = req.headers['x-admin-token'];
    const provided = Array.isArray(token) ? token[0] : token;
    if (provided !== adminToken) {
      return reply.status(401).send({
        error: { code: 'unauthorized', message: 'admin token required' },
      });
    }
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const limitNum = q.limit ? Number(q.limit) : undefined;
    const entries = app.audit.query({
      actorId: q.actorId,
      action: q.action,
      since: q.since,
      until: q.until,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
    return reply.send({ entries, count: entries.length });
  });
}
