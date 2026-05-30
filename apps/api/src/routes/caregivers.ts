import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { caregiverService } from '../services/caregiverInstance';
import { ALL_SCOPES, type CaregiverScope } from '../services/CaregiverService';

const CreateBody = z.object({
  label: z.string().min(1).max(80),
  scopes: z.array(z.enum(ALL_SCOPES as [CaregiverScope, ...CaregiverScope[]])).default(['view-meds']),
  ttlSeconds: z.number().int().min(60).max(60 * 60 * 24 * 365).nullable().optional(),
});

function userIdOf(req: FastifyRequest): string {
  // Prefer JWT subject when @fastify/jwt is engaged; fall back to header for dev/CLI.
  const fromJwt = (req as any).user?.sub as string | undefined;
  const fromHeader = req.headers['x-user-id'];
  const id = fromJwt ?? (typeof fromHeader === 'string' ? fromHeader : undefined);
  if (!id) throw Object.assign(new Error('unauthenticated'), { statusCode: 401 });
  return id;
}

/**
 * GET /caregivers           list shares for the authenticated user
 * POST /caregivers          issue a new share token
 */
export async function registerCaregivers(app: FastifyInstance) {
  app.get('/caregivers', { schema: { tags: ['caregivers'] } }, async (req, reply) => {
    try {
      const userId = userIdOf(req);
      return reply.send({ shares: caregiverService().list(userId) });
    } catch (e: any) {
      return reply.status(e.statusCode ?? 500).send({ error: { code: 'unauthenticated', message: e.message } });
    }
  });

  app.post('/caregivers', { schema: { tags: ['caregivers'] } }, async (req, reply) => {
    let userId: string;
    try { userId = userIdOf(req); } catch (e: any) {
      return reply.status(401).send({ error: { code: 'unauthenticated', message: e.message } });
    }
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const { share, token } = caregiverService().issue({
      userId,
      label: parsed.data.label,
      scopes: parsed.data.scopes,
      ttlSeconds: parsed.data.ttlSeconds ?? null,
    });
    return reply.status(201).send({ share, token });
  });
}
