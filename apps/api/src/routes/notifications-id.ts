import type { FastifyInstance } from 'fastify';

/** Routes for notifications-id. */
export async function registerNotificationsId(app: FastifyInstance) {
  app.get('/notifications/:id', {
    schema: { tags: ['notifications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'notifications-id', method: 'get', path: '/notifications/:id', echo: req.params });
  });
  app.patch('/notifications/:id', {
    schema: { tags: ['notifications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'notifications-id', method: 'patch', path: '/notifications/:id', echo: req.params });
  });
  app.delete('/notifications/:id', {
    schema: { tags: ['notifications'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'notifications-id', method: 'delete', path: '/notifications/:id', echo: req.params });
  });
}
