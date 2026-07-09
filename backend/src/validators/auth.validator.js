import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().optional().default(''),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8),
  role: z.enum(['buyer', 'seller']).default('buyer'),
});