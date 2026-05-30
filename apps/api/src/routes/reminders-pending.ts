import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pendingDoses, planUpcomingReminders } from '../services/ReminderEngine';

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

const DoseInput = z.object({
  medicationId: z.string(),
  scheduleId: z.string(),
  dueAt: z.string(),
  takenAt: z.string().nullable().optional(),
});

const Body = z.object({
  schedules: z.array(ScheduleInput).default([]),
  existing: z.array(DoseInput).default([]),
  lookaheadDays: z.number().int().min(1).max(14).default(1),
  leadMinutes: z.number().int().min(0).max(60).default(5),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  now: z.string().datetime().optional(),
});

/**
 * POST /reminders/pending
 *
 * Returns the scheduled reminder plan: which pending doses need a reminder,
 * when each should fire after quiet-hours deferral, and a flag indicating
 * whether the reminder was deferred or is firing inside its normal lead
 * window. Stateless so a worker can call this with a snapshot of schedules
 * and previously created doses.
 */
export async function registerRemindersPending(app: FastifyInstance) {
  app.post('/reminders/pending', { schema: { tags: ['reminders'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
    const schedules = parsed.data.schedules.map((s) => ({
      ...s,
      startsAt: s.startsAt,
    })) as any;
    const existing = parsed.data.existing.map((d) => ({
      ...d,
      dueAt: new Date(d.dueAt),
    })) as any;
    const pending = pendingDoses(schedules, existing, now, parsed.data.lookaheadDays);
    const quiet = parsed.data.quietHoursStart && parsed.data.quietHoursEnd
      ? { start: parsed.data.quietHoursStart, end: parsed.data.quietHoursEnd }
      : null;
    const planned = planUpcomingReminders(pending, { now, leadMinutes: parsed.data.leadMinutes, quiet });
    return reply.send({
      now: now.toISOString(),
      pendingCount: pending.length,
      deferredCount: planned.filter((p) => p.deferred).length,
      reminders: planned.map((p) => ({
        medicationId: p.medicationId,
        scheduleId: p.scheduleId,
        dueAt: p.dueAt.toISOString(),
        fireAt: p.fireAt.toISOString(),
        deferred: p.deferred,
        snoozeEligible: p.snoozeEligible,
      })),
    });
  });

  app.get('/reminders/pending', { schema: { tags: ['reminders'] } }, async (_req, reply) => {
    return reply.send({
      message: 'POST schedules, existing doses, quiet hours, and lead minutes to receive a reminder plan.',
    });
  });
}
