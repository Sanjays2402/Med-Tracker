import type { FastifyInstance } from 'fastify';

/** Routes for doses. */
export async function registerDoses(app: FastifyInstance) {
  app.get('/doses', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses', method: 'get', path: '/doses', echo: req.params });
  });
}
