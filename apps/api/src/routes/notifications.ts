import type { FastifyInstance } from 'fastify';

/** Routes for notifications. */
export async function registerNotifications(app: FastifyInstance) {
  app.get('/notifications', {
    schema: { tags: ['notifications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'notifications', method: 'get', path: '/notifications', echo: req.params });
  });
}
