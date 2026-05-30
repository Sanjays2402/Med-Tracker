import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { join } from 'node:path';
import { DrugCatalog } from '../services/DrugCatalog';
import { InteractionService } from '../services/InteractionService';

const catalog = new DrugCatalog(join(__dirname, '..', '..', '..', '..', 'content', 'drugs'));
const service = new InteractionService(catalog);

const Query = z.object({
  drugIds: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * GET /interactions/for/user
 * Until the medication store is wired through Prisma, this endpoint accepts a
 * comma separated or repeated `drugIds` query so the web and mobile clients can
 * pass the current user's active drug ids and receive the same scored report
 * shape as `/interactions/check`.
 */
export async function registerInteractionsForUser(app: FastifyInstance) {
  app.get('/interactions/for/user', { schema: { tags: ['interactions'] } }, async (req, reply) => {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const raw = parsed.data.drugIds;
    const ids = Array.isArray(raw)
      ? raw
      : typeof raw === 'string' && raw.length
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    if (!ids.length) {
      return reply.send({ interactions: [], counts: { minor: 0, moderate: 0, major: 0, contraindicated: 0 }, highest: null, checkedDrugIds: [], unknownDrugIds: [] });
    }
    return reply.send(service.classifyByIds(ids));
  });
}
