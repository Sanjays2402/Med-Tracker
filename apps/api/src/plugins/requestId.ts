import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Request ID plugin.
 *
 * Honors an inbound `x-request-id` header when present (trimmed, max 128 chars,
 * limited to safe characters) and otherwise generates a UUID v4. The chosen id
 * is exposed on `request.id`, echoed back via the `x-request-id` response
 * header, and bound to the per-request logger so every log line carries it.
 */
const SAFE_ID = /^[A-Za-z0-9._\-]{1,128}$/;

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const inbound = req.headers['x-request-id'];
    const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
    const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
    const id = trimmed && SAFE_ID.test(trimmed) ? trimmed : randomUUID();

    // Fastify exposes req.id as readonly via genReqId; assign through cast.
    (req as unknown as { id: string }).id = id;
    req.log = req.log.child({ reqId: id });
    reply.header('x-request-id', id);
  });
};

export default fp(plugin, { name: 'requestId' });
