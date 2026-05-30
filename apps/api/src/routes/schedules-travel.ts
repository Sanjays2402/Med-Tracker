import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { planTravelSchedule } from '@med/utils';

const Body = z.object({
  homeZone: z.string().min(3),
  targetZone: z.string().min(3),
  departAt: z.string().datetime(),
  returnAt: z.string().datetime(),
  homeTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(12),
  intervalHours: z.number().positive().max(48),
  toleranceHours: z.number().nonnegative().max(12).optional(),
  maxShiftPerDayHours: z.number().positive().max(12).optional(),
});

/**
 * POST /schedules/travel
 *
 * Generates a timezone-shift-aware dose plan for a trip. Doses gradually
 * migrate from home wall times toward target-zone wall times over a few days,
 * hold steady at the destination, then migrate back, while keeping the
 * inter-dose interval inside a tolerance band.
 */
export async function registerSchedulesTravel(app: FastifyInstance) {
  app.post('/schedules/travel', { schema: { tags: ['schedules'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    try {
      const plan = planTravelSchedule(parsed.data);
      return reply.send(plan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'invalid input';
      return reply.status(400).send({ error: { code: 'bad_request', message: msg } });
    }
  });
}
