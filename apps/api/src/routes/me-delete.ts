import type { FastifyInstance } from 'fastify';
import { meUserId } from './me';

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
  app.delete('/me', { schema: { tags: ['me'] } }, async (req, reply) => {
    let userId: string;
    try {
      userId = meUserId(req);
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 401).send({
        error: { code: 'unauthenticated', message: err.message },
      });
    }

    const removed = await app.audit.purgeActor(userId);

    // Tombstone. Recorded after the purge so it is not itself removed.
    await app.audit.record({
      actor: { id: userId },
      action: 'me.delete',
      method: req.method,
      route: '/me',
      status: 200,
      reqId: req.id,
      ip: req.ip,
      meta: { removedEntries: removed },
    });

    return reply.send({
      ok: true,
      userId,
      removedAuditEntries: removed,
      deletedAt: new Date().toISOString(),
    });
  });
}
