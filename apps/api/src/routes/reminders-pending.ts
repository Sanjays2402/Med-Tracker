import type { FastifyInstance } from 'fastify';

/** Routes for reminders-pending. */
export async function registerRemindersPending(app: FastifyInstance) {
  app.get('/reminders/pending', {
    schema: { tags: ['reminders'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reminders-pending', method: 'get', path: '/reminders/pending', echo: req.params });
  });
}
