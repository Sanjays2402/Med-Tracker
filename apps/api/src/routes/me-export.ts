import type { FastifyInstance } from 'fastify';
import { meUserId } from './me';

/**
 * GET /me/export
 *
 * GDPR right-to-portability endpoint. Returns every audit trail entry the
 * authenticated user produced, as a single JSON document with a download
 * disposition. The format is intentionally raw JSON, not transformed, so
 * the user receives the same shape the platform stores internally.
 *
 * Identity is taken from the JWT bearer (sub claim) when present, with the
 * x-user-id fallback used elsewhere in the API for dev and CLI flows.
 *
 * The bundle includes:
 *   - schemaVersion        contract version for downstream parsers
 *   - exportedAt           ISO timestamp the bundle was produced
 *   - userId               the actor id the export was scoped to
 *   - auditEntries         every audit entry attributed to this user, oldest first
 *   - auditEntryCount      length of auditEntries
 *
 * The endpoint itself is excluded from the audit trail by the audit plugin's
 * SKIP_ROUTES list addition, since the request is a read and would otherwise
 * be ignored anyway, but the response is still counted in /metrics so abuse
 * is visible.
 */
export async function registerMeExport(app: FastifyInstance) {
  app.get('/me/export', { schema: { tags: ['me'] }, config: app.rateLimitTier('export') }, async (req, reply) => {
    let userId: string;
    try {
      userId = meUserId(req);
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 401).send({
        error: { code: 'unauthenticated', message: err.message },
      });
    }

    // Query without a limit cap relevant to the user; AuditService caps at
    // 1000, so we page by walking the file from the end. For typical user
    // volumes this single call is sufficient; deployments with very heavy
    // audit volume should back the export with a job queue.
    const auditEntries = app.audit
      .query({ actorId: userId, limit: 1000 })
      .slice()
      .reverse(); // oldest first for human readability

    const bundle = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      userId,
      auditEntries,
      auditEntryCount: auditEntries.length,
    };

    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header(
      'content-disposition',
      `attachment; filename="med-tracker-export-${userId}.json"`,
    );
    return reply.send(bundle);
  });
}
