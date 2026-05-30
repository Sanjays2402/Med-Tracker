import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { computeColdChainStatus } from '@med/utils';

const Spec = z.object({
  medicationId: z.string().min(1),
  medicationName: z.string().min(1),
  roomTempBudgetHours: z.number().positive().max(24 * 365),
  maxAllowedC: z.number().min(-40).max(80),
  nominalAmbientC: z.number().min(-40).max(80).optional(),
  manufacturerExpiresAt: z.string().datetime().optional(),
});

const Excursion = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  temperatureC: z.number().min(-40).max(80),
});

const Body = z.object({
  spec: Spec,
  firstUseAt: z.string().datetime(),
  excursions: z.array(Excursion).max(2000),
  now: z.string().datetime().optional(),
});

/**
 * POST /cold-chain/status
 *
 * Computes the remaining room-temperature in-use budget for a refrigerated
 * medication given its spec, first-use time, and a list of temperature
 * excursions. Returns consumed and remaining hours, projected discard-by
 * instant, must-discard flag, and per-excursion consumption details.
 */
export async function registerColdChainStatus(app: FastifyInstance) {
  app.post('/cold-chain/status', { schema: { tags: ['cold-chain'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    try {
      const status = computeColdChainStatus(parsed.data);
      return reply.send(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'invalid input';
      return reply.status(400).send({ error: { code: 'bad_request', message: msg } });
    }
  });
}
