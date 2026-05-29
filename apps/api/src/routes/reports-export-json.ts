import type { FastifyInstance } from 'fastify';

/** Routes for reports-export-json. */
export async function registerReportsExportJson(app: FastifyInstance) {
  app.get('/reports/export/json', {
    schema: { tags: ['reports'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reports-export-json', method: 'get', path: '/reports/export/json', echo: req.params });
  });
}
