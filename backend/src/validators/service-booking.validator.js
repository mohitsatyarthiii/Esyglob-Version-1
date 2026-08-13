import { z } from 'zod';

const addressSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().email().optional().or(z.literal('')),
  line1: z.string().trim().min(5).max(240),
  line2: z.string().trim().max(240).optional().default(''),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().min(2).max(80),
  countryCode: z.string().trim().length(2).transform(value => value.toUpperCase()),
  placeId: z.string().trim().max(180).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const shipmentSchema = z.object({
  description: z.string().trim().min(2).max(240),
  quantity: z.coerce.number().int().min(1).max(9999),
  weightKg: z.coerce.number().positive().max(100000),
  lengthCm: z.coerce.number().positive().max(1000),
  widthCm: z.coerce.number().positive().max(1000),
  heightCm: z.coerce.number().positive().max(1000),
  packageCount: z.coerce.number().int().min(1).max(9999).optional().default(1),
  declaredValue: z.coerce.number().nonnegative().max(1_000_000_000).default(0),
  currency: z.string().trim().length(3).transform(value => value.toUpperCase()).default('INR'),
  contents: z.enum(['documents', 'non_documents']).default('non_documents'),
  dangerousGoods: z.boolean().optional().default(false),
  dangerousGoodsDescription: z.string().trim().max(500).optional(),
  insuranceRequested: z.boolean().optional().default(false),
  incoterm: z.enum(['DAP', 'DDP', 'EXW', 'FCA', 'CPT', 'CIP']).optional().default('DAP'),
  hsCode: z.string().trim().max(18).optional(),
  countryOfOrigin: z.string().trim().length(2).transform(value => value.toUpperCase()).optional(),
}).superRefine((value, context) => {
  if (value.contents === 'non_documents' && !value.countryOfOrigin) {
    context.addIssue({ code: 'custom', path: ['countryOfOrigin'], message: 'Country of origin is required for non-document shipments' });
  }
  if (value.dangerousGoods) {
    context.addIssue({
      code: 'custom',
      path: ['dangerousGoods'],
      message: 'Dangerous-goods booking requires carrier-specific classification and is not enabled in this workflow',
    });
  }
});

export const providerSearchSchema = z.object({
  pickup: addressSchema,
  destination: addressSchema,
  shipment: shipmentSchema,
  pickupDate: z.coerce.date().optional(),
}).superRefine((value, context) => {
  if (String(value.destination.phone || '').length < 6) {
    context.addIssue({ code: 'custom', path: ['destination', 'phone'], message: 'A valid delivery phone number is required' });
  }
  if ((value.pickup.countryCode !== 'IN' || value.destination.countryCode !== 'IN') && String(value.pickup.phone || '').length < 6) {
    context.addIssue({ code: 'custom', path: ['pickup', 'phone'], message: 'A valid pickup phone number is required for international shipping' });
  }
  for (const side of ['pickup', 'destination']) {
    if (value[side].countryCode === 'IN' && !/^\d{6}$/.test(value[side].postalCode)) {
      context.addIssue({ code: 'custom', path: [side, 'postalCode'], message: 'Enter a valid 6-digit Indian pincode' });
    }
  }
});

export const providerSelectionSchema = z.object({
  providerQuoteId: z.string().trim().min(12),
});

export function parseProviderSearch(input) {
  const result = providerSearchSchema.safeParse(input);
  if (!result.success) {
    const error = new Error(result.error.issues[0]?.message || 'Invalid provider search');
    error.statusCode = 422;
    error.code = 'INVALID_PROVIDER_SEARCH';
    error.fieldErrors = Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.'), issue.message]));
    throw error;
  }
  return result.data;
}
