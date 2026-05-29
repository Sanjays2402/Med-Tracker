import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  timezone: z.string().default('UTC'),
  locale: z.enum(['en', 'es', 'hi', 'fr']).default('en'),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const NewUserSchema = UserSchema.omit({ id: true, createdAt: true });
export type NewUser = z.infer<typeof NewUserSchema>;
