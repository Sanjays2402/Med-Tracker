import { z } from 'zod';

export const DoseStatus = z.enum(['scheduled', 'taken', 'skipped', 'missed', 'late']);
export type DoseStatus = z.infer<typeof DoseStatus>;

export const DoseSchema = z.object({
  id: z.string().uuid(),
  medicationId: z.string().uuid(),
  scheduleId: z.string().uuid(),
  dueAt: z.string().datetime(),
  takenAt: z.string().datetime().nullable().optional(),
  status: DoseStatus.default('scheduled'),
  note: z.string().max(280).optional(),
});
export type Dose = z.infer<typeof DoseSchema>;

export const LogDoseSchema = z.object({
  doseId: z.string().uuid(),
  status: DoseStatus,
  note: z.string().max(280).optional(),
});
