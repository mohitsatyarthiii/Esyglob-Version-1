import { z } from 'zod';

export const SHIPPING_TYPES = ['ocean_fcl', 'ocean_lcl', 'air_freight', 'air_express', 'express_courier'];
export const SHIPPING_STATUSES = ['draft', 'quoted', 'booked', 'in_transit', 'customs_clearance', 'out_for_delivery', 'delivered', 'cancelled'];

const addressSchema = z.object({
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(40).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(60).optional(),
  pickupDate: z.coerce.date().optional(),
}).passthrough();

const packageSchema = z.object({
  description: z.string().trim().max(500).optional(),
  quantity: z.coerce.number().min(1).optional().default(1),
  weight: z.coerce.number().min(0).optional().default(0),
  length: z.coerce.number().min(0).optional().default(0),
  width: z.coerce.number().min(0).optional().default(0),
  height: z.coerce.number().min(0).optional().default(0),
  value: z.coerce.number().min(0).optional().default(0),
  hsCode: z.string().trim().max(40).optional(),
  isHazardous: z.boolean().optional(),
}).passthrough();

export const shippingCreateSchema = z.object({
  type: z.enum(SHIPPING_TYPES),
  pickup: addressSchema,
  delivery: addressSchema,
  packages: z.array(packageSchema).min(1),
  declaredValue: z.coerce.number().min(0).optional(),
  insurance: z.unknown().optional(),
  specialInstructions: z.string().trim().max(3000).optional(),
});

export const shipmentActionSchema = z.object({
  action: z.enum(['book', 'cancel']),
  reason: z.string().trim().max(1000).optional(),
}).strict();

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}