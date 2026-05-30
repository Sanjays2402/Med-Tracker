import type { FastifyInstance } from 'fastify';
import { caregiverService } from '../services/caregiverInstance';

/** GET /caregivers/:id  DELETE /caregivers/:id (revoke) */
export async function registerCaregiversId(app: FastifyInstance) {
  app.get('/caregivers/:id', { schema: { tags: ['caregivers'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const share = caregiverService().get(id);
    if (!share) return reply.status(404).send({ error: { code: 'not_found', message: 'share not found' } });
    return reply.send({ share });
  });

  app.delete('/caregivers/:id', { schema: { tags: ['caregivers'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = caregiverService().revoke(id);
    if (!ok) return reply.status(404).send({ error: { code: 'not_found', message: 'share not found' } });
    return reply.status(204).send();
  });
}
