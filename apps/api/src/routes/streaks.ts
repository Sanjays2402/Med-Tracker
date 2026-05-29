import type { FastifyInstance } from 'fastify';

/** Routes for streaks. */
export async function registerStreaks(app: FastifyInstance) {
  app.get('/streaks', {
    schema: { tags: ['streaks'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'streaks', method: 'get', path: '/streaks', echo: req.params });
  });
}
