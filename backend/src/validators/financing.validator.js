import { z } from 'zod';
import mongoose from 'mongoose';

export const FINANCING_TYPES = ['po_financing', 'invoice_factoring', 'supply_chain', 'working_capital'];
export const FINANCING_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'funded', 'repaying', 'completed', 'defaulted', 'rejected', 'cancelled'];

export const financingCreateSchema = z.object({
  type: z.enum(FINANCING_TYPES),
  requestedAmount: z.coerce.number().positive(),
  currency: z.string().trim().min(3).max(8).optional().default('USD'),
  termDays: z.coerce.number().int().min(1).max(3650).optional().default(90),
  purchaseOrder: z.unknown().optional(),
  invoices: z.array(z.unknown()).optional(),
  supplierId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)).optional(),
  documents: z.array(z.unknown()).optional(),
  bankAccount: z.unknown().optional(),
});

export const financingPatchSchema = z.object({
  status: z.enum(FINANCING_STATUSES).optional(),
  approvedAmount: z.coerce.number().min(0).optional(),
  interestRate: z.coerce.number().min(0).optional(),
  processingFee: z.coerce.number().min(0).optional(),
  repaymentSchedule: z.array(z.unknown()).optional(),
  totalRepaid: z.coerce.number().min(0).optional(),
  remainingBalance: z.coerce.number().min(0).optional(),
  creditScore: z.coerce.number().min(0).optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  approvedBy: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)).optional(),
  approvedAt: z.coerce.date().optional(),
  fundedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(3000).optional(),
  rejectionReason: z.string().trim().max(2000).optional(),
}).strict();

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}