import type { FastifyInstance } from 'fastify';

/** Routes for webhooks-pharmacy. */
export async function registerWebhooksPharmacy(app: FastifyInstance) {
  app.post('/webhooks/pharmacy', {
    schema: { tags: ['webhooks'] },
  }, async (req, reply) => {
    return reply.send({ ok: true, resource: 'webhooks-pharmacy', method: 'post', path: '/webhooks/pharmacy', echo: req.params });
  });
}
