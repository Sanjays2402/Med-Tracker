import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DrugCatalog } from '../services/DrugCatalog';
import { join } from 'node:path';

const catalog = new DrugCatalog(join(__dirname, '..', '..', '..', '..', 'content', 'drugs'));

const Body = z.object({ drugIds: z.array(z.string()).min(1).max(50) });

/** Routes for interactions-check. */
export async function registerInteractionsCheck(app: FastifyInstance) {
  app.post(
    '/interactions/check',
    { schema: { tags: ['interactions'] } },
    async (req, reply) => {
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
      }
      const interactions = catalog.checkInteractions(parsed.data.drugIds);
      return reply.send({ interactions });
    },
  );
}
