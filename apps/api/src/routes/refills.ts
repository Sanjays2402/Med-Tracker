import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for refills. */
export async function registerRefills(app: FastifyInstance) {
  app.get('/refills', { schema: { tags: ['refills'] } }, async (_req, reply) => {
    return reply.send({ refills: store.listRefills() });
  });
  app.post('/refills', { schema: { tags: ['refills'] } }, async (_req, reply) => {
    return reply.send({ refills: store.listRefills() });
  });
}
