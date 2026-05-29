import type { FastifyInstance } from 'fastify';

/** Routes for preferences. */
export async function registerPreferences(app: FastifyInstance) {
  app.get('/preferences', {
    schema: { tags: ['preferences'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'preferences', method: 'get', path: '/preferences', echo: req.params });
  });
  app.put('/preferences', {
    schema: { tags: ['preferences'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'preferences', method: 'put', path: '/preferences', echo: req.params });
  });
}
