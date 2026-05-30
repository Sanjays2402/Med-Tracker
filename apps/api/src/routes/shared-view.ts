import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { caregiverService } from '../services/caregiverInstance';
import { ALL_SCOPES, type CaregiverScope } from '../services/CaregiverService';

const Query = z.object({
  token: z.string().min(20),
  /** Optional comma-separated scopes the client wants to read. */
  scopes: z.string().optional(),
});

/**
 * GET /shared/view?token=...&scopes=view-meds,view-adherence
 *
 * Verifies a caregiver token, enforces the requested scope set, and returns
 * the share descriptor (label, scopes, expiresAt). Once the data layer is
 * wired this endpoint will also project the patient's meds/adherence/refills
 * filtered by the share's scopes.
 */
export async function registerSharedView(app: FastifyInstance) {
  app.get('/shared/view', { schema: { tags: ['shared'] } }, async (req, reply) => {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const requested: CaregiverScope[] = (parsed.data.scopes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is CaregiverScope => ALL_SCOPES.includes(s as CaregiverScope));

    const result = caregiverService().verify(parsed.data.token, requested);
    if (!result.ok) {
      const status = result.reason === 'scope_denied' ? 403
        : result.reason === 'expired' || result.reason === 'revoked' ? 410
        : 401;
      return reply.status(status).send({ error: { code: result.reason, message: `token ${result.reason}` } });
    }
    return reply.send({
      share: {
        id: result.share.id,
        label: result.share.label,
        scopes: result.share.scopes,
        expiresAt: result.share.expiresAt,
      },
      requestedScopes: requested,
      issuedAt: new Date(result.payload.iat * 1000).toISOString(),
    });
  });
}
