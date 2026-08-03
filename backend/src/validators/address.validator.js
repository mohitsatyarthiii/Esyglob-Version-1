import { z } from 'zod';

export const createAddressSchema = z.object({
  fullName: z.string().trim().min(2),
  companyName: z.string().trim().optional().default(''),
  phone: z.string().trim().min(6),
  country: z.string().trim().min(2),
  state: z.string().trim().min(1),
  city: z.string().trim().min(1),
  district: z.string().trim().optional().default(''),
  postalCode: z.string().trim().max(20).optional().default(''),
  address: z.string().trim().min(5),
  street: z.string().trim().optional().default(''),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use a valid 2-letter ISO country code').toUpperCase(),
  placeId: z.string().trim().max(180).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  gpsAccuracy: z.number().nonnegative().optional(),
  locationSource: z.enum(['manual', 'autocomplete', 'gps', 'legacy']).optional(),
  addressLabel: z.enum(['Home', 'Office', 'Warehouse', 'Other']).optional().default('Other'),
  addressType: z.string().trim().max(30).optional(),
  landmark: z.string().trim().optional().default(''),
  isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = createAddressSchema;

export const patchAddressSchema = z.object({
  isDefault: z.boolean().optional(),
}).passthrough();
