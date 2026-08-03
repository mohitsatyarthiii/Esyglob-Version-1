import { z } from 'zod';

export const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().positive().optional(),
  altitude: z.number().optional(),
  speed: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  address: z.object({
    formatted: z.string().optional(),
    formattedAddress: z.string().optional(),
    line1: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    district: z.string().optional(),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).toUpperCase().optional(),
    placeId: z.string().optional(),
  }).optional(),
});
