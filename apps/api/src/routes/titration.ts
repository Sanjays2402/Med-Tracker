import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TitrationService } from '../services/TitrationService';
import type { TitrationPlan } from '@med/utils';

const StepSchema = z.object({
  dose: z.number().min(0),
  unit: z.string().min(1).max(16),
  durationDays: z.number().int().positive().nullable(),
  note: z.string().max(280).optional(),
});

const PlanSchema = z.object({
  id: z.string().min(1),
  medicationId: z.string().min(1),
  startDate: z.string().min(1),
  steps: z.array(StepSchema).min(1).max(20),
});

const LookupBody = z.object({
  plan: PlanSchema,
  asOf: z.string().datetime().optional(),
});

const TimelineBody = z.object({
  plan: PlanSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
});

/**
 * Titration endpoints expose dose-stepping calculations as a stateless API
 * the web and mobile clients can call without needing to ship the math.
 *
 *   POST /titration/lookup   — current dose plus the next scheduled change.
 *   POST /titration/timeline — per-day doses across a bounded window.
 *
 * Both routes validate the plan structurally and reject windows over a year
 * so they remain cheap and predictable.
 */
export async function registerTitration(app: FastifyInstance) {
  const svc = new TitrationService();

  app.post('/titration/lookup', { schema: { tags: ['titration'] } }, async (req, reply) => {
    const parsed = LookupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const asOf = parsed.data.asOf ? new Date(parsed.data.asOf) : new Date();
    const out = svc.lookup(parsed.data.plan as TitrationPlan, asOf);
    if ('code' in out) {
      return reply.code(422).send({ error: out });
    }
    return reply.send(out);
  });

  app.post('/titration/timeline', { schema: { tags: ['titration'] } }, async (req, reply) => {
    const parsed = TimelineBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const out = svc.timeline(
      parsed.data.plan as TitrationPlan,
      new Date(parsed.data.from),
      new Date(parsed.data.to),
    );
    if (!Array.isArray(out) && 'code' in out) {
      return reply.code(422).send({ error: out });
    }
    return reply.send({ days: out });
  });
}
