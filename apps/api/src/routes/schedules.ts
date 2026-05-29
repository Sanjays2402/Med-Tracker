import type { FastifyInstance } from 'fastify';

/** Routes for schedules. */
export async function registerSchedules(app: FastifyInstance) {
  app.get('/schedules', {
    schema: { tags: ['schedules'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'schedules', method: 'get', path: '/schedules', echo: req.params });
  });
  app.post('/schedules', {
    schema: { tags: ['schedules'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'schedules', method: 'post', path: '/schedules', echo: req.params });
  });
}
