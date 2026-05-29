import { z } from 'zod';
export const WeeklyPointSchema = z.object({ date: z.string().date(), takenPct: z.number().min(0).max(100) });
export const AdherenceReportSchema = z.object({
  userId: z.string().uuid(),
  from: z.string().date(),
  to: z.string().date(),
  adherencePct: z.number().min(0).max(100),
  weekly: z.array(WeeklyPointSchema),
});
export type AdherenceReport = z.infer<typeof AdherenceReportSchema>;
