import type { FastifyInstance } from 'fastify';
import { composeCaregiverDigest, type DigestInput } from '@med/utils';

/**
 * POST /caregivers/:id/digest — render a weekly caregiver digest preview from
 * an explicit DigestInput payload. The route is intentionally stateless: the
 * caller assembles the adherence summary, missed dose list, and refill
 * forecast (which it already does for the patient dashboard) and this route
 * composes the human-readable subject and body.
 *
 * In production a scheduled job calls composeCaregiverDigest directly and
 * pipes the output to email/SMS providers; this endpoint exists so the web
 * UI can preview exactly what a caregiver will receive before issuing or
 * rotating a share token.
 */
export async function registerCaregiversIdDigest(app: FastifyInstance) {
  app.post(
    '/caregivers/:id/digest',
    {
      schema: {
        tags: ['caregivers'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['patient', 'weekStart', 'weekEnd', 'adherence', 'medicationNames', 'missedDoses'],
          properties: {
            patient: { type: 'object' },
            weekStart: { type: 'string' },
            weekEnd: { type: 'string' },
            adherence: { type: 'object' },
            medicationNames: { type: 'object' },
            missedDoses: { type: 'array' },
            refills: { type: 'array' },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as DigestInput;
      const out = composeCaregiverDigest(body);
      return reply.send(out);
    },
  );
}
