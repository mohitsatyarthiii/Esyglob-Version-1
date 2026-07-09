import { z } from 'zod';

export const createReviewSchema = z.object({
  reviewId: z.string().optional(),
  productId: z.string().optional(),
  sellerId: z.string().optional(),
  orderId: z.string().optional(),
  rating: z.coerce.number().min(1).max(5),
  quality: z.coerce.number().min(1).max(5).optional(),
  communication: z.coerce.number().min(1).max(5).optional(),
  shipping: z.coerce.number().min(1).max(5).optional(),
  value: z.coerce.number().min(1).max(5).optional(),
  title: z.string().trim().max(120).optional().default(''),
  comment: z.string().trim().max(2000).optional().default(''),
  images: z.array(z.string().trim().min(1)).optional().default([]),
});

export const updateReviewSchema = createReviewSchema.extend({
  reviewId: z.string().min(1, 'reviewId is required'),
});

export const sellerResponseSchema = z.object({
  comment: z.string().trim().min(2).max(1000),
});

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}