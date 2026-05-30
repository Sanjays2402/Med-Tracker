import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for doses-today. */
export async function registerDosesToday(app: FastifyInstance) {
  app.get('/doses/today', { schema: { tags: ['doses'] } }, async (_req, reply) => {
    return reply.send({ doses: store.listDosesToday() });
  });
}
