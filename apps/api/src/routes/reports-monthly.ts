import type { FastifyInstance } from 'fastify';

/** Routes for reports-monthly. */
export async function registerReportsMonthly(app: FastifyInstance) {
  app.get('/reports/monthly', {
    schema: { tags: ['reports'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reports-monthly', method: 'get', path: '/reports/monthly', echo: req.params });
  });
}
