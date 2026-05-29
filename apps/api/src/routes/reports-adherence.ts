import type { FastifyInstance } from 'fastify';

/** Routes for reports-adherence. */
export async function registerReportsAdherence(app: FastifyInstance) {
  app.get('/reports/adherence', {
    schema: { tags: ['reports'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'reports-adherence', method: 'get', path: '/reports/adherence', echo: req.params });
  });
}
