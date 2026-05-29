import { z } from 'zod';
export const RefillSchema = z.object({
  id: z.string().uuid(),
  medicationId: z.string().uuid(),
  filledAt: z.string().datetime(),
  quantity: z.number().int().positive(),
  pharmacy: z.string().max(120).optional(),
  prescriber: z.string().max(120).optional(),
  cost: z.number().nonnegative().optional(),
});
export type Refill = z.infer<typeof RefillSchema>;
