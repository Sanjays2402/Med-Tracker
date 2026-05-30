import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Resolve the calling user id. Prefers @fastify/jwt's verified subject,
 * falls back to x-user-id for local dev and CLI testing in line with the
 * rest of the API (see routes/caregivers.ts). Throws a 401-tagged error
 * when neither is present.
 */
export function meUserId(req: FastifyRequest): string {
  const fromJwt = (req as unknown as { user?: { sub?: string; id?: string } }).user;
  const subj = fromJwt?.sub ?? fromJwt?.id;
  const hdr = req.headers['x-user-id'];
  const id = subj ?? (typeof hdr === 'string' ? hdr : undefined);
  if (!id) throw Object.assign(new Error('unauthenticated'), { statusCode: 401 });
  return id;
}

/** GET /me, PATCH /me. */
export async function registerMe(app: FastifyInstance) {
  app.get('/me', { schema: { tags: ['me'] } }, async (req, reply) => {
    try {
      const id = meUserId(req);
      const u = (req as unknown as { user?: { role?: string; email?: string } }).user ?? {};
      return reply.send({ id, role: u.role ?? 'user', email: u.email ?? null });
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({
        error: { code: 'unauthenticated', message: err.message },
      });
    }
  });

  app.patch('/me', { schema: { tags: ['me'] } }, async (req, reply) => {
    try {
      const id = meUserId(req);
      return reply.send({ ok: true, id });
    } catch (e) {
      const err = e as { statusCode?: number; message: string };
      return reply.status(err.statusCode ?? 500).send({
        error: { code: 'unauthenticated', message: err.message },
      });
    }
  });
}
