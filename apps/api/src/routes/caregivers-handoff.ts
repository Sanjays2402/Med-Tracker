import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildShiftHandoff } from '@med/utils';

const ScheduledDose = z.object({
  doseId: z.string().min(1),
  medicationId: z.string().min(1),
  medicationName: z.string().min(1),
  scheduledFor: z.string().datetime(),
  strength: z.string().min(1),
  prn: z.boolean().optional(),
  instruction: z.string().max(280).optional(),
});

const HistoryEvent = z.object({
  doseId: z.string().min(1),
  medicationId: z.string().min(1),
  medicationName: z.string().min(1),
  scheduledFor: z.string().datetime(),
  actedAt: z.string().datetime().optional(),
  status: z.enum(['taken', 'missed', 'skipped', 'late']),
});

const PrnUsage = z.object({
  medicationId: z.string().min(1),
  medicationName: z.string().min(1),
  takenAt: z.string().datetime(),
  dailyCap: z.number().int().positive().max(24),
});

const Alert = z.object({
  id: z.string().min(1),
  kind: z.string().min(1).max(40),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1).max(500),
  raisedAt: z.string().datetime(),
  acknowledged: z.boolean().optional(),
});

const Body = z.object({
  patientName: z.string().min(1).max(120),
  outgoingCaregiver: z.string().min(1).max(120),
  incomingCaregiver: z.string().min(1).max(120),
  now: z.string().datetime(),
  lookaheadHours: z.number().positive().max(48).optional(),
  recencyHours: z.number().positive().max(48).optional(),
  upcoming: z.array(ScheduledDose).max(500),
  history: z.array(HistoryEvent).max(500),
  prnUsage: z.array(PrnUsage).max(500),
  alerts: z.array(Alert).max(200),
});

/**
 * POST /caregivers/handoff
 *
 * Builds a deterministic shift handoff brief covering upcoming doses,
 * recent missed or late doses, PRN usage against daily caps, and open
 * alerts. Returns structured fields plus a plain-text rendering suitable
 * for SMS, in-app display, or email delivery.
 */
export async function registerCaregiversHandoff(app: FastifyInstance) {
  app.post('/caregivers/handoff', { schema: { tags: ['caregivers'] } }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    try {
      const report = buildShiftHandoff(parsed.data);
      return reply.send(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'invalid input';
      return reply.status(400).send({ error: { code: 'bad_request', message: msg } });
    }
  });
}
