import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().trim().optional().default(''),
  categoryId: z.string().trim().optional().default(''),
  subcategoryId: z.string().trim().optional().default(''),
  category: z.string().trim().optional().default(''),
  subcategory: z.string().trim().optional().default(''),
  price: z.coerce.number().min(0).default(0),
  currency: z.string().trim().default('INR'),
  unit: z.string().trim().optional().default('piece'),
  priceTiers: z.array(z.object({
    minimumQuantity: z.coerce.number().min(1),
    maximumQuantity: z.coerce.number().min(1).optional().nullable(),
    unitPrice: z.coerce.number().min(0),
  })).optional().default([]),
  minimumOrderQuantity: z.coerce.number().min(1).default(1),
  samplePrice: z.coerce.number().min(0).nullable().optional(),
  sampleAvailable: z.boolean().optional().default(false),
  orderType: z.enum(['inquiry_only', 'rfq_only', 'direct_order_enabled']).optional().default('inquiry_only'),
  directOrderEnabled: z.boolean().optional(),
  description: z.string().trim().max(2000).optional().default(''),
  productType: z.string().trim().optional().default(''),
  images: z.array(z.string().trim().min(1)).optional().default([]),
  videos: z.array(z.object({
    url: z.string().trim().min(1),
    thumbnailUrl: z.string().trim().optional(),
    title: z.string().trim().optional(),
  })).optional().default([]),
  specifications: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
  leadTime: z.coerce.number().min(0).optional().default(0),
  leadTimeUnit: z.enum(['days', 'weeks', 'months']).optional().default('days'),
  deliveryTime: z.coerce.number().min(0).optional().default(0),
  deliveryTimeUnit: z.enum(['days', 'weeks', 'months']).optional().default('days'),
  paymentTerms: z.enum(['prepayment', 'partial_prepayment', 'bank_transfer', 'credit', 'negotiable']).optional().default('negotiable'),
  certifications: z.array(z.union([
    z.string().trim(),
    z.object({
      name: z.string().trim().min(1),
      issuer: z.string().trim().optional(),
      certificateNumber: z.string().trim().optional(),
      documentUrl: z.string().trim().optional(),
      validUntil: z.coerce.date().optional(),
    }),
  ])).optional().default([]),
  manufacturingDetails: z.object({
    processType: z.string().trim().optional().default(''),
    capacity: z.string().trim().optional().default(''),
    automationLevel: z.string().trim().optional().default(''),
  }).optional().default({}),
  packaging: z.object({
    type: z.string().trim().optional().default(''),
    weight: z.string().trim().optional().default(''),
    dimensions: z.string().trim().optional().default(''),
    unitsPerPackage: z.coerce.number().min(1).optional(),
    customizationAvailable: z.boolean().optional(),
  }).optional().default({}),
  shipping: z.object({
    available: z.boolean().optional().default(false),
    methods: z.array(z.string().trim()).optional().default([]),
    originPort: z.string().trim().optional().default(''),
    countries: z.array(z.string().trim()).optional().default([]),
    estimateText: z.string().trim().optional().default(''),
  }).optional().default({}),
  warranty: z.string().trim().optional().default(''),
  warrantyPeriod: z.string().trim().optional().default(''),
  tags: z.array(z.string().trim()).optional().default([]),
  status: z.enum(['draft', 'published', 'pending_review', 'rejected', 'active', 'paused']).default('draft'),
});

export const productUpdateSchema = productSchema;

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}