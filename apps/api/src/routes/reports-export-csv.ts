import type { FastifyInstance } from 'fastify';

/** Routes for reports-export-csv. */
export async function registerReportsExportCsv(app: FastifyInstance) {
  app.get('/reports/export/csv', {
    schema: { tags: ['reports'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reports-export-csv', method: 'get', path: '/reports/export/csv', echo: req.params });
  });
}
