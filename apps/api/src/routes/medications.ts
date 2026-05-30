import type { FastifyInstance } from 'fastify';
import { store } from '../store/inMemoryStore';

/** Routes for medications. */
export async function registerMedications(app: FastifyInstance) {
  app.get('/medications', { schema: { tags: ['medications'] } }, async (_req, reply) => {
    return reply.send({ medications: store.listMedications() });
  });
  app.post('/medications', { schema: { tags: ['medications'] } }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return reply.status(400).send({ error: { code: 'bad_request', message: 'name is required' } });
    }
    const created = store.createMedication({
      name,
      strength: typeof body.strength === 'string' ? body.strength : undefined,
      form: typeof body.form === 'string' ? body.form : undefined,
      instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
      schedule: typeof body.schedule === 'string' ? body.schedule : undefined,
      remainingDoses: typeof body.remainingDoses === 'number' ? body.remainingDoses : undefined,
      refillThresholdDays: typeof body.refillThresholdDays === 'number' ? body.refillThresholdDays : undefined,
    });
    return reply.status(201).send({ medication: created });
  });
}
