import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for medications-id. */
export async function registerMedicationsId(app: FastifyInstance) {
  app.get('/medications/:id', { schema: { tags: ['medications'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const m = store.getMedication(id);
    if (!m) return reply.status(404).send({ error: { code: 'not_found', message: 'medication not found' } });
    return reply.send({ medication: m });
  });
  app.patch('/medications/:id', { schema: { tags: ['medications'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = (req.body ?? {}) as Record<string, unknown>;
    const updated = store.updateMedication(id, patch as never);
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'medication not found' } });
    return reply.send({ medication: updated });
  });
  app.delete('/medications/:id', { schema: { tags: ['medications'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const archived = store.archiveMedication(id);
    if (!archived) return reply.status(404).send({ error: { code: 'not_found', message: 'medication not found' } });
    return reply.send({ medication: archived });
  });
}
