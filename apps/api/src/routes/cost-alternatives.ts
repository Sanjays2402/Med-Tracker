import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rankCostAlternatives } from '@med/utils';

const Tier = z.enum(['generic', 'preferred-brand', 'non-preferred', 'specialty']);

const Current = z.object({
  medicationId: z.string().min(1),
  name: z.string().min(1),
  classId: z.string().min(1),
  strength: z.number().positive(),
  dosesPerDay: z.number().positive().max(24),
  copayCents: z.number().int().nonnegative(),
  daysSupply: z.number().int().positive().max(365),
  tier: Tier,
});

const Candidate = z.object({
  medicationId: z.string().min(1),
  name: z.string().min(1),
  classId: z.string().min(1),
  strength: z.number().positive(),
  equivalenceRatio: z.number().positive(),
  copayCents: z.number().int().nonnegative(),
  daysSupply: z.number().int().positive().max(365),
  tier: Tier,
  switchFriction: z.number().min(0).max(1).optional(),
});

const Body = z.object({
  current: z.array(Current).min(1).max(50),
  catalog: z.array(Candidate).max(500),
  contraindicatedIds: z.array(z.string()).max(200).optional(),
  contraindicatedClasses: z.array(z.string()).max(100).optional(),
  minMonthlySavingsCents: z.number().int().nonnegative().optional(),
  equivalenceTolerance: z.number().min(0).max(1).optional(),
});

/**
 * POST /cost/alternatives
 *
 * Ranks lower-cost therapeutic alternatives for a regimen given a catalog of
 * candidates and the patient's contraindications. Returns a plan with per-med
 * recommendations sorted by monthly savings and a total monthly savings tally.
 */
export async function registerCostAlternatives(app: FastifyInstance) {
  app.post('/cost/alternatives', { schema: { tags: ['cost'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    try {
      const plan = rankCostAlternatives(parsed.data);
      return reply.send(plan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'invalid input';
      return reply.status(400).send({ error: { code: 'bad_request', message: msg } });
    }
  });
}
