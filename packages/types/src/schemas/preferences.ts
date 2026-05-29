import { z } from 'zod';
export const PreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  reminderLeadMinutes: z.number().int().min(0).max(60).default(5),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  caregiverShareEnabled: z.boolean().default(false),
});
export type Preferences = z.infer<typeof PreferencesSchema>;
