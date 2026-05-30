import type { FastifyInstance } from 'fastify';

/** Routes for reports-export-pdf. */
export async function registerReportsExportPdf(app: FastifyInstance) {
  app.get('/reports/export/pdf', {
    schema: { tags: ['reports'] },
    config: app.rateLimitTier('export'),
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reports-export-pdf', method: 'get', path: '/reports/export/pdf', echo: req.params });
  });
}
