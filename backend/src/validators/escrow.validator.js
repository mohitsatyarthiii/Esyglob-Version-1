import { z } from 'zod';
import mongoose from 'mongoose';

export const ESCROW_STATUSES = [
  'draft', 'pending_seller', 'funded', 'in_progress', 'shipped',
  'delivered', 'inspection', 'completed', 'disputed', 'refunded', 'cancelled',
];

export const escrowCreateSchema = z.object({
  sellerId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)),
  orderId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)).optional().nullable(),
  description: z.string().trim().max(2000).optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().min(3).max(8).optional().default('USD'),
  milestones: z.array(z.object({
    title: z.string().trim().max(160).optional(),
    percentage: z.coerce.number().min(0).max(100).optional(),
    amount: z.coerce.number().min(0).optional(),
    condition: z.string().trim().max(500).optional(),
  }).passthrough()).optional(),
  paymentMethod: z.enum(['bank_transfer', 'credit_card', 'wire', 'digital']).optional(),
  terms: z.string().trim().max(5000).optional(),
  inspectionPeriod: z.coerce.number().int().min(0).max(90).optional(),
});

export const escrowPatchSchema = z.object({
  action: z.enum(['deposit', 'approve', 'dispute']).optional(),
  paymentReference: z.string().trim().max(160).optional(),
  reason: z.string().trim().max(2000).optional(),
  status: z.enum(ESCROW_STATUSES).optional(),
}).strict();

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}