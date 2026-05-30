import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  alertsToDispatch,
  nextAlert,
  pendingAlertsForBatch,
  pendingAlertsForDose,
  type EscalationPolicy,
} from '@med/utils';
import type { Dose } from '@med/types';

const ChannelEnum = z.enum(['push', 'sms', 'email', 'voice']);
const StatusEnum = z.enum(['scheduled', 'taken', 'skipped', 'missed', 'late']);

const TierSchema = z.object({
  id: z.string(),
  label: z.string(),
  delayMinutes: z.number().int().min(0).max(72 * 60),
  recipients: z
    .array(z.object({ id: z.string(), name: z.string(), channel: ChannelEnum }))
    .min(1)
    .max(20),
  expireMinutes: z.number().int().min(1).max(7 * 24 * 60).optional(),
});

const PolicySchema = z.object({
  id: z.string(),
  label: z.string(),
  tiers: z.array(TierSchema).min(1).max(10),
  resolveOn: z.array(StatusEnum).optional(),
});

const DoseInput = z.object({
  id: z.string(),
  medicationId: z.string(),
  scheduleId: z.string(),
  dueAt: z.string(),
  takenAt: z.string().nullable().optional(),
  status: StatusEnum,
});

const PendingBody = z.object({
  policy: PolicySchema,
  doses: z.array(DoseInput).min(1).max(500),
  now: z.string().datetime().optional(),
  alreadySent: z
    .array(z.object({ doseId: z.string(), tierId: z.string(), recipientId: z.string() }))
    .optional(),
});

const NextBody = z.object({
  policy: PolicySchema,
  dose: DoseInput,
  now: z.string().datetime().optional(),
});

/**
 * Caregiver escalation endpoints.
 *
 *   POST /escalation/pending — for a batch of doses, return the alerts that
 *   should be in flight right now, deduplicated against any already sent.
 *
 *   POST /escalation/next — for one dose, return the soonest upcoming tier
 *   so the client can show a "spouse will be notified in 12 minutes" hint.
 */
export async function registerEscalation(app: FastifyInstance) {
  app.post('/escalation/pending', { schema: { tags: ['escalation'] } }, async (req, reply) => {
    const parsed = PendingBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
    const expected = pendingAlertsForBatch(
      parsed.data.doses as unknown as Dose[],
      parsed.data.policy as EscalationPolicy,
      now,
    );
    const toSend = alertsToDispatch(expected, parsed.data.alreadySent ?? []);
    return reply.send({
      expectedCount: expected.length,
      pendingCount: toSend.length,
      alerts: toSend,
    });
  });

  app.post('/escalation/next', { schema: { tags: ['escalation'] } }, async (req, reply) => {
    const parsed = NextBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
    const expected = pendingAlertsForDose(
      parsed.data.dose as unknown as Dose,
      parsed.data.policy as EscalationPolicy,
      now,
    );
    const next = nextAlert(
      parsed.data.dose as unknown as Dose,
      parsed.data.policy as EscalationPolicy,
      now,
    );
    return reply.send({
      activeTiers: expected.map((a) => a.tierId),
      next: next ? { tierId: next.tier.id, label: next.tier.label, fireAt: next.fireAt.toISOString() } : null,
    });
  });
}
