import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveConflicts, type ScheduledMedication, type SpacingRule } from '@med/utils';

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

const SpacingRuleInput = z.object({
  medicationA: z.string(),
  medicationB: z.string(),
  minMinutes: z.number().int().min(1).max(24 * 60),
  reason: z.string().max(140).optional(),
});

const Body = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  meds: z.array(z.object({ medicationId: z.string(), schedule: ScheduleInput })).min(1).max(50),
  spacingRules: z.array(SpacingRuleInput).optional(),
  clusterWindowMinutes: z.number().int().min(1).max(720).optional(),
  clusterThreshold: z.number().int().min(2).max(50).optional(),
  duplicateWindowMinutes: z.number().int().min(1).max(120).optional(),
  maxShiftMinutes: z.number().int().min(5).max(360).optional(),
  stepMinutes: z.number().int().min(5).max(60).optional(),
  lockedScheduleIds: z.array(z.string()).optional(),
});

/**
 * POST /schedules/resolve
 *
 * Companion to /schedules/conflicts. Returns a list of minimal-shift
 * proposals that, when applied, reduce or eliminate conflicts. The caller
 * decides which proposals to accept; this endpoint never persists changes.
 */
export async function registerSchedulesResolve(app: FastifyInstance) {
  app.post('/schedules/resolve', { schema: { tags: ['schedules'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (to.getTime() < from.getTime()) {
      return reply.code(400).send({ error: { code: 'invalid_range', message: 'to must be on or after from' } });
    }
    const proposals = resolveConflicts(parsed.data.meds as unknown as ScheduledMedication[], {
      from,
      to,
      clusterWindowMinutes: parsed.data.clusterWindowMinutes,
      clusterThreshold: parsed.data.clusterThreshold,
      duplicateWindowMinutes: parsed.data.duplicateWindowMinutes,
      spacingRules: parsed.data.spacingRules as SpacingRule[] | undefined,
      maxShiftMinutes: parsed.data.maxShiftMinutes,
      stepMinutes: parsed.data.stepMinutes,
      lockedScheduleIds: parsed.data.lockedScheduleIds,
    });
    return reply.send({ count: proposals.length, proposals });
  });
}
