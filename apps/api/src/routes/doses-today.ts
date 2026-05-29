import type { FastifyInstance } from 'fastify';

/** Routes for doses-today. */
export async function registerDosesToday(app: FastifyInstance) {
  app.get('/doses/today', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-today', method: 'get', path: '/doses/today', echo: req.params });
  });
}
