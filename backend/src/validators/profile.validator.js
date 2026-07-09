import { z } from 'zod';

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().default(''),
  email: z.string().trim().email().max(180),
  phone: z.string().trim().max(40).optional().default(''),
  avatarUrl: z.string().trim().url().or(z.literal('')).optional().default(''),
  country: z.string().trim().max(80).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  businessType: z.string().trim().max(80).optional().default(''),
  companyDescription: z.string().trim().max(2000).optional().default(''),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});