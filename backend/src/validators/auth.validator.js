import { z } from 'zod';
import { normalizeRole } from '../lib/constants.js';

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().optional().default(''),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8),
  role: z.enum(['buyer', 'seller', 'supplier']).optional(),
  roles: z.array(z.enum(['buyer', 'seller', 'supplier'])).optional(),
}).transform((data) => ({
  ...data,
  role: normalizeRole(data.role || data.roles?.[0] || 'buyer'),
}));

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  challengeId: z.string().uuid().optional(),
});

export const verifyPasswordResetOtpSchema = z.object({
  challengeId: z.string().uuid(),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
});

export const resetPasswordSchema = z.object({
  challengeId: z.string().uuid(),
  resetToken: z.string().min(32).max(256),
  password: passwordSchema,
  confirmPassword: z.string(),
}).superRefine((data, context) => {
  if (data.password !== data.confirmPassword) {
    context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' });
  }
}).transform(({ confirmPassword: _confirmPassword, ...data }) => data);
