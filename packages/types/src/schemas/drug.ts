import { z } from 'zod';
export const DrugSchema = z.object({
  id: z.string(),
  generic: z.string(),
  brand: z.string(),
  class: z.string(),
  rxnormSample: z.number().int(),
  indications: z.array(z.string()),
  dosages: z.array(z.string()),
  routes: z.array(z.string()),
  frequencies: z.array(z.string()),
  interactions: z.array(z.string()),
  warnings: z.array(z.string()),
  pregnancyCategory: z.enum(['A', 'B', 'C', 'D', 'X']),
  storage: z.string(),
  sourceNote: z.string(),
});
export type Drug = z.infer<typeof DrugSchema>;

export const DrugIndexEntrySchema = DrugSchema.pick({ id: true, generic: true, brand: true, class: true });
export type DrugIndexEntry = z.infer<typeof DrugIndexEntrySchema>;
