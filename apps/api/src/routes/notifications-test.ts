import type { FastifyInstance } from 'fastify';

/** Routes for notifications-test. */
export async function registerNotificationsTest(app: FastifyInstance) {
  app.post('/notifications/test', {
    schema: { tags: ['notifications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'notifications-test', method: 'post', path: '/notifications/test', echo: req.params });
  });
}
