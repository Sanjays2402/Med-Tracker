import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forecastStreakSurvival } from '@med/utils';

const DoseSchema = z.object({
  dueAt: z.string().datetime(),
  takenAt: z.string().datetime().nullable(),
});

const Body = z.object({
  doses: z.array(DoseSchema).max(5000),
  horizonDays: z.number().int().min(1).max(90).optional(),
  recencyHalfLifeDays: z.number().int().min(1).max(365).optional(),
});

/**
 * POST /streaks/forecast
 *
 * Stateless projection of streak survival probability across the next
 * horizonDays. Body carries the user's dose history so this works offline-first
 * and across mobile/web without requiring a server-side join. Returns daily
 * survival points with 95% Wilson confidence bounds and a summary.
 */
export async function registerStreaksForecast(app: FastifyInstance) {
  app.post('/streaks/forecast', { schema: { tags: ['streaks'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const forecast = forecastStreakSurvival(parsed.data);
    return reply.send(forecast);
  });
}
