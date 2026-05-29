import type { FastifyInstance } from 'fastify';

/** Routes for schedules-id. */
export async function registerSchedulesId(app: FastifyInstance) {
  app.get('/schedules/:id', {
    schema: { tags: ['schedules'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'schedules-id', method: 'get', path: '/schedules/:id', echo: req.params });
  });
  app.patch('/schedules/:id', {
    schema: { tags: ['schedules'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'schedules-id', method: 'patch', path: '/schedules/:id', echo: req.params });
  });
  app.delete('/schedules/:id', {
    schema: { tags: ['schedules'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'schedules-id', method: 'delete', path: '/schedules/:id', echo: req.params });
  });
}
