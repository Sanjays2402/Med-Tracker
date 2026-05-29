import type { FastifyInstance } from 'fastify';
import { DrugCatalog } from '../services/DrugCatalog';
import { join } from 'node:path';

const catalog = new DrugCatalog(join(__dirname, '..', '..', '..', '..', 'content', 'drugs'));

/** Routes for drugs-search. */
export async function registerDrugsSearch(app: FastifyInstance) {
  app.get(
    '/drugs/search',
    { schema: { tags: ['drugs'] } },
    async (req, reply) => {
      const { q = '', limit = '25' } = (req.query ?? {}) as { q?: string; limit?: string };
      const results = catalog.search(q, Math.min(Number(limit) || 25, 100));
      return reply.send({ query: q, count: results.length, results });
    },
  );
}
