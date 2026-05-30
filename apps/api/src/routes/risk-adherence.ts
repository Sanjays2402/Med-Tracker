import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdherenceRiskService } from '../services/AdherenceRiskService';

const DoseInput = z.object({
  id: z.string(),
  medicationId: z.string(),
  scheduleId: z.string(),
  dueAt: z.string(),
  takenAt: z.string().nullable().optional(),
  status: z.enum(['scheduled', 'taken', 'skipped', 'missed', 'late']),
  note: z.string().optional(),
});

const Options = z.object({
  windowDays: z.number().int().min(7).max(180).optional(),
  recencyHalfLifeDays: z.number().min(1).max(60).optional(),
  timeBucketHours: z.number().int().min(1).max(12).optional(),
});

const Row = z.object({
  medicationId: z.string(),
  doses: z.array(DoseInput).max(2000),
  nextDueAt: z.string().datetime().optional(),
});

const Body = z.object({
  rows: z.array(Row).min(1).max(200),
  options: Options.optional(),
});

/**
 * POST /risk/adherence
 *
 * Accepts a batch of medications, each with its recent dose history and an
 * optional next dueAt. Returns risk scores ranked highest first along with
 * per-feature breakdowns so the UI can explain the ranking.
 */
export async function registerRiskAdherence(app: FastifyInstance) {
  const svc = new AdherenceRiskService();

  app.post('/risk/adherence', { schema: { tags: ['risk'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const ranked = svc.rank(
      parsed.data.rows.map((r) => ({
        medicationId: r.medicationId,
        doses: r.doses as any,
        nextDueAt: r.nextDueAt ? new Date(r.nextDueAt) : undefined,
      })),
      parsed.data.options ?? {},
    );
    return reply.send({
      count: ranked.length,
      highCount: ranked.filter((r) => r.level === 'high').length,
      moderateCount: ranked.filter((r) => r.level === 'moderate').length,
      results: ranked,
    });
  });
}
