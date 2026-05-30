import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for doses-id-take. */
export async function registerDosesIdTake(app: FastifyInstance) {
  app.post('/doses/:id/take', { schema: { tags: ['doses'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const updated = store.setDoseStatus(id, 'taken');
    if (!updated) return reply.status(404).send({ error: { code: 'not_found', message: 'dose not found' } });
    return reply.send({ dose: updated });
  });
}
