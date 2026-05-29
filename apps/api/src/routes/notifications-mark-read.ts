import type { FastifyInstance } from 'fastify';

/** Routes for notifications-mark-read. */
export async function registerNotificationsMarkRead(app: FastifyInstance) {
  app.post('/notifications/mark/read', {
    schema: { tags: ['notifications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'notifications-mark-read', method: 'post', path: '/notifications/mark/read', echo: req.params });
  });
}
