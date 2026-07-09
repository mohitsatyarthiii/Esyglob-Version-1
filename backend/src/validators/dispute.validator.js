import { z } from 'zod';
import mongoose from 'mongoose';

export const DISPUTE_TYPES = ['quality', 'delivery', 'payment', 'contract', 'other'];
export const DISPUTE_STATUSES = [
  'filed', 'under_review', 'evidence_gathering', 'mediation',
  'resolution_proposed', 'accepted', 'appealed', 'resolved', 'closed',
];
export const TRANSACTION_TYPES = ['order', 'escrow', 'shipping', 'quality', 'payment'];

export const disputeCreateSchema = z.object({
  respondentId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)),
  transactionType: z.enum(TRANSACTION_TYPES),
  transactionId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)),
  type: z.enum(DISPUTE_TYPES),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(5000),
  desiredResolution: z.string().trim().max(2000).optional(),
  claimAmount: z.coerce.number().min(0).optional(),
  currency: z.string().trim().min(3).max(8).optional().default('USD'),
  evidence: z.array(z.unknown()).optional().default([]),
});

export const disputePatchSchema = z.object({
  message: z.string().trim().min(1).max(5000).optional(),
  attachments: z.array(z.string().trim().max(1000)).optional().default([]),
  status: z.enum(DISPUTE_STATUSES).optional(),
}).strict();

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}