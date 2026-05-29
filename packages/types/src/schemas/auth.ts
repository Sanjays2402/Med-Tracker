import { z } from 'zod';
export const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const SignupSchema = LoginSchema.extend({ displayName: z.string().min(1).max(80) });
export const TokenSchema = z.object({ token: z.string(), expiresAt: z.string().datetime() });
export type Token = z.infer<typeof TokenSchema>;
