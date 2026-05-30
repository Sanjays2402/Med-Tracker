import type { FastifyInstance } from 'fastify';

/**
 * GET /admin/audit
 *
 * Query the persisted audit trail. Two ways to authorise:
 *
 *   1. JWT bearer with role=admin (normal operator path; see plugins/auth.ts)
 *   2. x-admin-token header matching ADMIN_TOKEN (break-glass for ops without
 *      a provisioned admin user; disabled when ADMIN_TOKEN is empty)
 *
 * At least one must succeed. If ADMIN_TOKEN is unset and the caller is not
 * an admin-roled JWT subject, the route returns 401.
 *
 * Query params:
 *   actorId  filter by actor id
 *   action   filter by action verb
 *   since    ISO timestamp lower bound (inclusive)
 *   until    ISO timestamp upper bound (inclusive)
 *   limit    max entries returned, capped at 1000, default 200
 */
export async function registerAdminAudit(app: FastifyInstance) {
  app.get('/admin/audit', { config: app.rateLimitTier('admin') }, async (req, reply) => {
    const adminToken = process.env.ADMIN_TOKEN ?? '';
    const tokenHdr = req.headers['x-admin-token'];
    const providedToken = Array.isArray(tokenHdr) ? tokenHdr[0] : tokenHdr;
    const tokenOk = adminToken.length > 0 && providedToken === adminToken;

    if (!tokenOk) {
      // Fall through to JWT RBAC. authenticate sets req.authUser or sends a 401.
      await app.authenticate(req, reply);
      if (reply.sent) return;
      if (req.authUser?.role !== 'admin') {
        return reply.status(403).send({
          error: { code: 'forbidden', message: "role 'admin' required" },
        });
      }
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
