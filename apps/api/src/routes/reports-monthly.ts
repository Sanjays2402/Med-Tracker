import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportService } from '../services/ReportService';

const Body = z.object({
  medicationIds: z.array(z.string()).min(1),
  refills: z.array(z.object({
    medicationId: z.string(),
    filledAt: z.string(),
    daySupply: z.number().int().positive(),
  })).default([]),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  threshold: z.number().min(0).max(1).optional(),
});

const service = new ReportService();

/** POST /reports/monthly: PDC and MPR rollup for a single calendar month. */
export async function registerReportsMonthly(app: FastifyInstance) {
  app.post('/reports/monthly', { schema: { tags: ['reports'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const summary = service.monthly(parsed.data);
    return reply.send({ year: parsed.data.year, month: parsed.data.month, summary });
  });

  app.get('/reports/monthly', { schema: { tags: ['reports'] } }, async (_req, reply) => {
    return reply.send({
      message: 'POST year, month, medicationIds, and refills to receive monthly adherence rollup.',
    });
  });
}
