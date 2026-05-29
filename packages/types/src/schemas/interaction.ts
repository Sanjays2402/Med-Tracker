import { z } from 'zod';
export const InteractionSeverity = z.enum(['minor', 'moderate', 'major', 'contraindicated']);
export const InteractionSchema = z.object({
  a: z.string(),
  b: z.string(),
  severity: InteractionSeverity,
  note: z.string(),
});
export type Interaction = z.infer<typeof InteractionSchema>;
