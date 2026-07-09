import { z } from 'zod';

export const createAddressSchema = z.object({
  fullName: z.string().trim().min(2),
  companyName: z.string().trim().optional().default(''),
  phone: z.string().trim().min(6),
  country: z.string().trim().min(2),
  state: z.string().trim().min(1),
  city: z.string().trim().min(1),
  postalCode: z.string().trim().min(3),
  address: z.string().trim().min(5),
  landmark: z.string().trim().optional().default(''),
  isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = createAddressSchema;

export const patchAddressSchema = z.object({
  isDefault: z.boolean().optional(),
}).passthrough();