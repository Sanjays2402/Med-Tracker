import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { join } from 'node:path';
import { DrugCatalog } from '../services/DrugCatalog';
import { buildInteractionGraph, rankSwapCandidates } from '@med/utils';

const catalog = new DrugCatalog(join(__dirname, '..', '..', '..', '..', 'content', 'drugs'));

const Query = z.object({
  drugIds: z.union([z.string(), z.array(z.string())]).optional(),
  includeSwap: z.union([z.literal('1'), z.literal('true')]).optional(),
});

function parseIds(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

/**
 * GET /interactions/graph
 *
 * Returns a regimen-level interaction graph: pairwise edges, per-drug nodes,
 * connected clusters, a composite risk score, and (optionally) ranked swap
 * candidates ordered by how much each removal lowers the risk score.
 */
export async function registerInteractionsGraph(app: FastifyInstance) {
  app.get('/interactions/graph', { schema: { tags: ['interactions'] }, config: app.rateLimitTier('heavy') }, async (req, reply) => {
    const parsed = Query.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const ids = parseIds(parsed.data.drugIds);
    if (!ids.length) {
      return reply.send({
        graph: {
          edges: [],
          nodes: [],
          clusters: [],
          worstSeverity: null,
          riskScore: 0,
          hubs: [],
          summary: 'No active medications provided.',
        },
        unknownDrugIds: [],
        swapCandidates: [],
      });
    }
    const unique = Array.from(new Set(ids));
    const drugs = catalog.byIds(unique);
    const known = new Set(drugs.map((d) => d.id));
    const unknownDrugIds = unique.filter((id) => !known.has(id));
    const graph = buildInteractionGraph(drugs);
    const swapCandidates = parsed.data.includeSwap ? rankSwapCandidates(drugs) : [];
    return reply.send({ graph, unknownDrugIds, swapCandidates });
  });
}
