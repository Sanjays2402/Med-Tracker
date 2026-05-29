import { z } from 'zod';

export const ScheduleKind = z.enum(['daily', 'weekly', 'interval', 'cron', 'asNeeded']);
export type ScheduleKind = z.infer<typeof ScheduleKind>;

export const TimeOfDaySchema = z.string().regex(/^\d{2}:\d{2}$/, 'expect HH:MM');

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  medicationId: z.string().uuid(),
  kind: ScheduleKind,
  times: z.array(TimeOfDaySchema).default([]),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  intervalHours: z.number().int().positive().optional(),
  cronExpression: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().default(true),
});
export type Schedule = z.infer<typeof ScheduleSchema>;
