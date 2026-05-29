import type { FastifyInstance } from 'fastify';

/** Routes for reminders-engine-run. */
export async function registerRemindersEngineRun(app: FastifyInstance) {
  app.post('/reminders/engine/run', {
    schema: { tags: ['reminders'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reminders-engine-run', method: 'post', path: '/reminders/engine/run', echo: req.params });
  });
}
