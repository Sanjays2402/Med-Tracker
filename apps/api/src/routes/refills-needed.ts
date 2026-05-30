import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RefillService } from '../services/RefillService';

const ScheduleInput = z.object({
  id: z.string(),
  medicationId: z.string(),
  kind: z.enum(['daily', 'weekly', 'interval', 'cron', 'asNeeded']),
  times: z.array(z.string()).default([]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  intervalHours: z.number().int().positive().optional(),
  cronExpression: z.string().optional(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
});

const Body = z.object({
  medications: z.array(z.object({
    medicationId: z.string(),
    supplyRemaining: z.number().int().min(0),
    dosePerAdmin: z.number().int().min(1).optional(),
    schedules: z.array(ScheduleInput).default([]),
  })).min(1).max(100),
  soonThresholdDays: z.number().int().min(1).max(60).optional(),
  urgentThresholdDays: z.number().int().min(1).max(30).optional(),
});

/**
 * POST /refills/needed
 *
 * Stateless forecast endpoint. Clients pass the user's active medication
 * supply rows; the server returns ranked forecasts with status, days of
 * supply, run-out date, and a human-readable reason. Returning forecasts for
 * every medication (not just attention items) makes the same call usable for
 * dashboard widgets and notification scheduling.
 */
export async function registerRefillsNeeded(app: FastifyInstance) {
  app.post('/refills/needed', { schema: { tags: ['refills'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const service = new RefillService({
      soonThresholdDays: parsed.data.soonThresholdDays,
      urgentThresholdDays: parsed.data.urgentThresholdDays,
    });
    const forecasts = service.forecastAll(parsed.data.medications as any);
    const needs = forecasts.filter((f) => f.status !== 'ok');
    return reply.send({
      forecasts,
      attentionCount: needs.length,
      urgentCount: forecasts.filter((f) => f.status === 'urgent' || f.status === 'out').length,
    });
  });

  // Keep GET as a documentation friendly hint endpoint.
  app.get('/refills/needed', { schema: { tags: ['refills'] } }, async (_req, reply) => {
    return reply.send({
      message: 'POST a medications array with schedules and supplyRemaining to receive a refill forecast.',
    });
  });
}
