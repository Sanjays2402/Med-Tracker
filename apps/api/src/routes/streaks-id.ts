import type { FastifyInstance } from 'fastify';

/** Routes for streaks-id. */
export async function registerStreaksId(app: FastifyInstance) {
  app.get('/streaks/:id', {
    schema: { tags: ['streaks'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'streaks-id', method: 'get', path: '/streaks/:id', echo: req.params });
  });
}
