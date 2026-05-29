import { z } from 'zod';
export const StreakSchema = z.object({
  medicationId: z.string().uuid(),
  currentDays: z.number().int().nonnegative(),
  longestDays: z.number().int().nonnegative(),
  lastTakenAt: z.string().datetime().nullable(),
});
export type Streak = z.infer<typeof StreakSchema>;
