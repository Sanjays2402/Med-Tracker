import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ReportService } from '../services/ReportService';

const RefillInput = z.object({
  medicationId: z.string(),
  filledAt: z.string(),
  daySupply: z.number().int().positive(),
});

const Body = z.object({
  medicationIds: z.array(z.string()).min(1),
  refills: z.array(RefillInput).default([]),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  windowDays: z.number().int().min(7).max(730).optional(),
  threshold: z.number().min(0).max(1).optional(),
});

const service = new ReportService();

/**
 * POST /reports/adherence
 * Returns industry-standard MPR and PDC by medication plus a summary across
 * the regimen. Accepts either an explicit window or a relative `windowDays`
 * count ending today.
 */
export async function registerReportsAdherence(app: FastifyInstance) {
  app.post('/reports/adherence', { schema: { tags: ['reports'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const { medicationIds, refills, windowStart, windowEnd, windowDays, threshold } = parsed.data;
    const end = windowEnd ? new Date(windowEnd) : new Date();
    const start = windowStart
      ? new Date(windowStart)
      : new Date(end.getTime() - (windowDays ?? 90) * 86_400_000);
    const window = { start, end };
    const perMedication = service.adherence({ medicationIds, refills, window });
    const summary = service.adherenceSummary({ medicationIds, refills, window, threshold });
    return reply.send({
      window: { start: start.toISOString(), end: end.toISOString() },
      perMedication,
      summary,
    });
  });

  app.get('/reports/adherence', { schema: { tags: ['reports'] } }, async (_req, reply) => {
    return reply.send({
      message: 'POST medicationIds and refills (with filledAt and daySupply) to receive MPR and PDC metrics.',
    });
  });
}
