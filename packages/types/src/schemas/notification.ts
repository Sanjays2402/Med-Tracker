import { z } from 'zod';
export const NotificationChannel = z.enum(['push', 'email', 'sms', 'inApp']);
export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  channel: NotificationChannel,
  subject: z.string(),
  body: z.string(),
  sentAt: z.string().datetime().nullable().optional(),
  readAt: z.string().datetime().nullable().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;
