import type { FastifyInstance } from 'fastify';

/** Routes for reports-weekly. */
export async function registerReportsWeekly(app: FastifyInstance) {
  app.get('/reports/weekly', {
    schema: { tags: ['reports'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reports-weekly', method: 'get', path: '/reports/weekly', echo: req.params });
  });
}
