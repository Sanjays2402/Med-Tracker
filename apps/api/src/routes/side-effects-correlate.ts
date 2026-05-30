import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { correlateSideEffects } from '@med/utils';

const Dose = z.object({
  medicationId: z.string().min(1),
  takenAt: z.string().datetime(),
});

const Symptom = z.object({
  symptom: z.string().min(1).max(64),
  reportedAt: z.string().datetime(),
  severity: z.number().int().min(1).max(10).optional(),
});

const Body = z.object({
  doses: z.array(Dose).max(20_000),
  symptoms: z.array(Symptom).max(10_000),
  medicationStarts: z.record(z.string(), z.string().datetime()),
  windowHours: z.number().positive().max(48).optional(),
  minDoses: z.number().int().min(1).max(1000).optional(),
  minSymptoms: z.number().int().min(1).max(1000).optional(),
});

/**
 * POST /side-effects/correlate
 *
 * Returns triage-grade correlation findings between medications and reported
 * symptoms. For each (medication, symptom) pair with enough data, returns
 * onset-window concentration, pre vs post-introduction rate, and a score in
 * [0,1]. Findings are sorted by score descending. Not a diagnostic claim.
 */
export async function registerSideEffectsCorrelate(app: FastifyInstance) {
  app.post('/side-effects/correlate', { schema: { tags: ['side-effects'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    try {
      const report = correlateSideEffects(parsed.data);
      return reply.send(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'invalid input';
      return reply.status(400).send({ error: { code: 'bad_request', message: msg } });
    }
  });
}
