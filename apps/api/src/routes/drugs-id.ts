import type { FastifyInstance } from 'fastify';
import { DrugCatalog } from '../services/DrugCatalog';
import { join } from 'node:path';

const catalog = new DrugCatalog(join(__dirname, '..', '..', '..', '..', 'content', 'drugs'));

/** Routes for drugs-id. */
export async function registerDrugsId(app: FastifyInstance) {
  app.get(
    '/drugs/:id',
    { schema: { tags: ['drugs'] } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const drug = catalog.get(id);
      if (!drug) return reply.status(404).send({ error: { code: 'not_found', message: 'drug not found' } });
      return reply.send(drug);
    },
  );
}
