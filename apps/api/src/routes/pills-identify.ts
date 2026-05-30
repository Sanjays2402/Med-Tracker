import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DEFAULT_PILL_CATALOG,
  PillIdentifierService,
} from '../services/PillIdentifierService';

const ShapeEnum = z.enum([
  'round',
  'oval',
  'oblong',
  'capsule',
  'triangle',
  'square',
  'rectangle',
  'diamond',
  'pentagon',
  'hexagon',
  'other',
]);

const ColorEnum = z.enum([
  'white',
  'off-white',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'blue',
  'green',
  'brown',
  'gray',
  'black',
  'clear',
]);

const Body = z.object({
  imprint: z.string().max(64).optional(),
  shape: ShapeEnum.optional(),
  colors: z.array(ColorEnum).max(4).optional(),
  scored: z.boolean().optional(),
  sizeMm: z.number().positive().max(50).optional(),
  minScore: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  sizeToleranceMm: z.number().min(0).max(10).optional(),
});

const singleton = new PillIdentifierService(DEFAULT_PILL_CATALOG);

/**
 * POST /pills/identify
 *
 * Returns ranked matches from the in-process pill catalog. At least one
 * physical attribute must be supplied. The handler refuses an empty query
 * outright so the matcher does not return the whole catalog.
 */
export async function registerPillsIdentify(app: FastifyInstance) {
  app.post('/pills/identify', { schema: { tags: ['pills'] }, config: app.rateLimitTier('heavy') }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'bad_request', message: parsed.error.message } });
    }
    const q = parsed.data;
    const hasAttribute =
      q.imprint !== undefined ||
      q.shape !== undefined ||
      (q.colors && q.colors.length > 0) ||
      q.scored !== undefined ||
      q.sizeMm !== undefined;
    if (!hasAttribute) {
      return reply.code(400).send({ error: { code: 'empty_query', message: 'supply at least one attribute' } });
    }
    const matches = singleton.identify(
      {
        imprint: q.imprint,
        shape: q.shape,
        colors: q.colors,
        scored: q.scored,
        sizeMm: q.sizeMm,
      },
      { minScore: q.minScore, limit: q.limit, sizeToleranceMm: q.sizeToleranceMm },
    );
    return reply.send({
      catalogSize: singleton.size(),
      count: matches.length,
      matches,
    });
  });

  app.get('/pills/catalog', { schema: { tags: ['pills'] } }, async (_req, reply) => {
    return reply.send({ count: singleton.size(), entries: DEFAULT_PILL_CATALOG });
  });
}
