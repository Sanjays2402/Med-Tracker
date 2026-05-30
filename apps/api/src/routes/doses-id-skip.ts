import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for doses-id-skip. */
export async function registerDosesIdSkip(app: FastifyInstance) {
  app.post('/doses/:id/skip', { schema: { tags: ['doses'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = store.setDoseStatus(id, 'skipped');
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'dose not found' } });
    return reply.send({ dose: updated });
  });
}
