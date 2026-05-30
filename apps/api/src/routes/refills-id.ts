import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for refills-id. */
export async function registerRefillsId(app: FastifyInstance) {
  app.get('/refills/:id', { schema: { tags: ['refills'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = store.getRefill(id);
    if (!r) return reply.status(404).send({ error: { code: 'not_found', message: 'refill not found' } });
    return reply.send({ refill: r });
  });
  app.patch('/refills/:id', { schema: { tags: ['refills'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = (req.body ?? {}) as Record<string, unknown>;
    const updated = store.updateRefill(id, patch as never);
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'refill not found' } });
    return reply.send({ refill: updated });
  });
  app.post('/refills/:id', { schema: { tags: ['refills'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { action?: string };
    const next = body.action === 'request' ? 'requested' : body.action === 'ready' ? 'ready' : body.action === 'filled' ? 'filled' : 'needed';
    const updated = store.updateRefill(id, { status: next as never });
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'refill not found' } });
    return reply.send({ refill: updated });
  });
  app.delete('/refills/:id', { schema: { tags: ['refills'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = store.updateRefill(id, { status: 'filled' });
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'refill not found' } });
    return reply.send({ refill: updated });
  });
}
