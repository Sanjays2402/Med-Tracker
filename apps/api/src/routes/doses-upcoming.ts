import type { FastifyInstance } from 'fastify';

/** Routes for doses-upcoming. */
export async function registerDosesUpcoming(app: FastifyInstance) {
  app.get('/doses/upcoming', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-upcoming', method: 'get', path: '/doses/upcoming', echo: req.params });
  });
}
