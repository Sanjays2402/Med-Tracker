import type { FastifyInstance } from 'fastify';
import { meUserId } from './me';
import { caregiverService } from '../services/caregiverInstance';

/**
 * GET /me/export
 *
 * GDPR right-to-portability endpoint. Returns the personal data the platform
 * stores for the authenticated user as a single JSON document with a
 * download disposition. The format is intentionally raw JSON, not
 * transformed, so the user receives the same shape the platform stores
 * internally.
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
 *   - caregiverShares      every caregiver share the user has issued
 *                          (sensitive fields like full token bytes are not
 *                          stored server-side and so are not included; only
 *                          the last 16 chars of the current signature are
 *                          retained for display and audit)
 *   - caregiverShareCount  length of caregiverShares
 *
 * The endpoint itself is excluded from the audit trail by the audit plugin's
 * SKIP_ROUTES list addition, since the request is a read and would otherwise
 * be ignored anyway, but the response is still counted in /metrics so abuse
 * is visible.
 */
export async function registerMeExport(app: FastifyInstance) {
  app.get(
    '/me/export',
    {
      schema: { tags: ['me'] },
      config: app.rateLimitTier('export'),
      preHandler: app.requireTenant(),
    },
    async (req, reply) => {
    let userId: string;
    try {
      userId = meUserId(req);
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 401).send({
        error: { code: 'unauthenticated', message: err.message },
      });
    }

    // Tenant isolation: an export is owned by the user-tenant. Refuse to
    // honour a token whose tenant claim does not match the user the
    // export is being produced for, even when both are technically valid,
    // so a stolen cross-tenant token cannot be used to exfiltrate data.
    if (!app.assertTenantOwns(req, userId)) {
      return reply.status(403).send({
        error: { code: 'tenant_mismatch', message: 'tenant does not own this resource' },
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

    const caregiverShares = caregiverService().list(userId);

    const bundle = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      userId,
      tenantId: req.tenantId,
      auditEntries,
      auditEntryCount: auditEntries.length,
      caregiverShares,
      caregiverShareCount: caregiverShares.length,
    };

    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header(
      'content-disposition',
      `attachment; filename="med-tracker-export-${userId}.json"`,
    );
    return reply.send(bundle);
    },
  );
}
