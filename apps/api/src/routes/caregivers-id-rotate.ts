import type { FastifyInstance } from 'fastify';
import { caregiverService } from '../services/caregiverInstance';

/** POST /caregivers/:id/rotate — issue a fresh token for an existing share. */
export async function registerCaregiversIdRotate(app: FastifyInstance) {
  app.post('/caregivers/:id/rotate', { schema: { tags: ['caregivers'] } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { share, token } = caregiverService().rotate(id);
      return reply.send({ share, token });
    } catch (e: any) {
      const code = /not found/i.test(e.message) ? 404 : 400;
      return reply.status(code).send({ error: { code: 'rotate_failed', message: e.message } });
    }
  });
}
