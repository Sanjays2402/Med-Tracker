import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { planRefillBatches } from '@med/utils';

const CandidateSchema = z.object({
  medicationId: z.string(),
  medicationName: z.string(),
  pharmacyId: z.string(),
  pharmacyName: z.string(),
  earliestFillDate: z.string().datetime(),
  runOutDate: z.string().datetime(),
  copayCents: z.number().int().nonnegative(),
  daysSupply: z.number().int().positive(),
  fillPreference: z.enum(['30day', '90day', 'either']).optional(),
  insurancePlanId: z.string().optional(),
});

const Body = z.object({
  candidates: z.array(CandidateSchema).max(200),
  preferredPickupDow: z.number().int().min(0).max(6).optional(),
  maxCopayCentsPerBatch: z.number().int().positive().optional(),
  windowSlackDays: z.number().int().min(0).max(14).optional(),
});

/**
 * POST /refills/batch
 *
 * Groups upcoming refill needs into the smallest reasonable set of pharmacy
 * pickups. Inputs are stateless so the same plan renders in the web shell,
 * mobile app, and caregiver digest without a server round-trip per surface.
 */
export async function registerRefillsBatch(app: FastifyInstance) {
  app.post('/refills/batch', { schema: { tags: ['refills'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const { candidates, ...opts } = parsed.data;
    const plan = planRefillBatches(candidates, opts);
    return reply.send(plan);
  });
}
