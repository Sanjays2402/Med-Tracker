import { z } from 'zod';
export const CaregiverShareSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  token: z.string().min(20),
  label: z.string().max(80),
  expiresAt: z.string().datetime().nullable().optional(),
  scopes: z.array(z.enum(['view-meds', 'view-adherence', 'view-refills'])).default(['view-meds']),
  createdAt: z.string().datetime(),
});
export type CaregiverShare = z.infer<typeof CaregiverShareSchema>;
