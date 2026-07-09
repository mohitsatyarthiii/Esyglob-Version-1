import { z } from 'zod';

export const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional().default(''),
  lastName: z.string().trim().max(60).optional().default(''),
  name: z.string().trim().max(120).optional().default(''),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional().default(''),
  company: z.string().trim().max(160).optional().default(''),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(5000),
  country: z.string().trim().max(80).optional().default(''),
  consent: z.boolean().refine(Boolean, { message: 'Consent is required' }),
}).refine(data => Boolean(data.name || data.firstName), {
  path: ['name'],
  message: 'Name is required',
});