import { z } from 'zod';
export const ExportFormat = z.enum(['csv', 'pdf', 'json']);
export const ExportRequestSchema = z.object({
  format: ExportFormat,
  from: z.string().date(),
  to: z.string().date(),
  includeNotes: z.boolean().default(true),
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;
