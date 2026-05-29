import type { FastifyInstance } from 'fastify';

/** Routes for health. */
export async function registerHealth(app: FastifyInstance) {
  app.get('/health', {
    schema: { tags: ['health'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'health', method: 'get', path: '/health', echo: req.params });
  });
}
