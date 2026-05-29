import type { FastifyInstance } from 'fastify';

/** Routes for doses-id-snooze. */
export async function registerDosesIdSnooze(app: FastifyInstance) {
  app.post('/doses/:id/snooze', {
    schema: { tags: ['doses'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'doses-id-snooze', method: 'post', path: '/doses/:id/snooze', echo: req.params });
  });
}
