import type { FastifyInstance } from 'fastify';

/** Routes for doses-id-skip. */
export async function registerDosesIdSkip(app: FastifyInstance) {
  app.post('/doses/:id/skip', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-id-skip', method: 'post', path: '/doses/:id/skip', echo: req.params });
  });
}
