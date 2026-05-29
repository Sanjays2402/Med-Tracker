import type { FastifyInstance } from 'fastify';

/** Routes for doses-id. */
export async function registerDosesId(app: FastifyInstance) {
  app.get('/doses/:id', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-id', method: 'get', path: '/doses/:id', echo: req.params });
  });
  app.patch('/doses/:id', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-id', method: 'patch', path: '/doses/:id', echo: req.params });
  });
}
