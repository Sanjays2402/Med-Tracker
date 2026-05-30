import type { FastifyInstance } from 'fastify';
import { meUserId } from './me';
import { caregiverService } from '../services/caregiverInstance';

/**
 * DELETE /me
 *
 * GDPR right-to-erasure endpoint. Purges every audit trail entry attributed
 * to the authenticated user and writes a single tombstone entry recording
 * that the deletion happened, so an operator can later prove the request
 * was honoured without retaining the user's prior activity.
 *
 * The tombstone is the only entry that survives for this user id after the
 * call. It records:
 *   - actor      the user id (so the action is traceable to the requester)
 *   - action     "me.delete"
 *   - meta.removedEntries   how many entries were purged
 *
 * If a future Prisma-backed deployment adds rows scoped by user id (a
 * subscriptions table, a notifications table, etc.), the deletion should
 * fan out here. Until then the audit trail is the only persistent surface
 * carrying user data on the server.
 */
export async function registerMeDelete(app: FastifyInstance) {
  app.delete(
    '/me',
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

    // Refuse cross tenant deletes for the same reason as cross tenant
    // exports. A token whose tenant claim points elsewhere cannot erase
    // this user's record.
    if (!app.assertTenantOwns(req, userId)) {
      return reply.status(403).send({
        error: { code: 'tenant_mismatch', message: 'tenant does not own this resource' },
      });
    }

    const removed = await app.audit.purgeActor(userId);
    const removedCaregiverShares = caregiverService().purgeUser(userId);

    // Tombstone. Recorded after the purge so it is not itself removed.
    await app.audit.record({
      actor: { id: userId },
      action: 'me.delete',
      method: req.method,
      route: '/me',
      status: 200,
      reqId: req.id,
      ip: req.ip,
      meta: { removedEntries: removed, removedCaregiverShares, tenantId: req.tenantId },
    });

    return reply.send({
      ok: true,
      userId,
      tenantId: req.tenantId,
      removedAuditEntries: removed,
      removedCaregiverShares,
      deletedAt: new Date().toISOString(),
    });
    },
  );
}
