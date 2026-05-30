import type { FastifyInstance } from 'fastify';
import { ScheduleService } from '../services/ScheduleService';
import type { ScheduledMedication, SpacingRule } from '@med/utils';

/**
 * POST /schedules/conflicts — given a set of scheduled medications, return any
 * cluster, duplicate, or spacing conflicts within the requested window. The
 * caller supplies the schedules so this route is reusable from both the
 * authenticated user surface and the caregiver review workflow.
 */
export interface ConflictRequestBody {
  from: string;
  to: string;
  meds: ScheduledMedication[];
  spacingRules?: SpacingRule[];
  clusterWindowMinutes?: number;
  clusterThreshold?: number;
  duplicateWindowMinutes?: number;
}

export async function registerSchedulesConflicts(app: FastifyInstance) {
  const svc = new ScheduleService();

  app.post(
    '/schedules/conflicts',
    {
      schema: {
        tags: ['schedules'],
        body: {
          type: 'object',
          required: ['from', 'to', 'meds'],
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            meds: { type: 'array' },
            spacingRules: { type: 'array' },
            clusterWindowMinutes: { type: 'integer', minimum: 1, maximum: 720 },
            clusterThreshold: { type: 'integer', minimum: 2, maximum: 50 },
            duplicateWindowMinutes: { type: 'integer', minimum: 1, maximum: 120 },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as ConflictRequestBody;
      const from = new Date(body.from);
      const to = new Date(body.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() < from.getTime()) {
        return reply.code(400).send({ error: 'invalid_range' });
      }
      const conflicts = svc.conflicts(body.meds ?? [], {
        from,
        to,
        spacingRules: body.spacingRules,
        clusterWindowMinutes: body.clusterWindowMinutes,
        clusterThreshold: body.clusterThreshold,
        duplicateWindowMinutes: body.duplicateWindowMinutes,
      });
      return reply.send({
        count: conflicts.length,
        critical: conflicts.filter((c) => c.severity === 'critical').length,
        warnings: conflicts.filter((c) => c.severity === 'warning').length,
        conflicts,
      });
    },
  );
}
