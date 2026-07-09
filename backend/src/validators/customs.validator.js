import { z } from 'zod';
import mongoose from 'mongoose';

export const CUSTOMS_TYPES = ['import', 'export'];
export const CUSTOMS_STATUSES = [
  'draft', 'submitted', 'documents_uploaded', 'under_review',
  'duties_calculated', 'duties_paid', 'filed', 'cleared',
  'held', 'released', 'cancelled',
];

const customsProductSchema = z.object({
  name: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  hsCode: z.string().trim().max(40).optional(),
  quantity: z.coerce.number().min(0).optional().default(0),
  unit: z.string().trim().max(40).optional(),
  unitValue: z.coerce.number().min(0).optional().default(0),
  totalValue: z.coerce.number().min(0).optional().default(0),
  originCountry: z.string().trim().max(80).optional(),
  dutyRate: z.coerce.number().min(0).optional(),
});

export const customsCreateSchema = z.object({
  type: z.enum(CUSTOMS_TYPES),
  shipmentId: z.string().optional().nullable(),
  carrier: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  originCountry: z.string().trim().min(1).max(80),
  destinationCountry: z.string().trim().min(1).max(80),
  portOfLoading: z.string().trim().max(120).optional(),
  portOfDischarge: z.string().trim().max(120).optional(),
  products: z.array(customsProductSchema).min(1),
  documents: z.array(z.unknown()).optional().default([]),
});

export const customsPatchSchema = z.object({
  status: z.enum(CUSTOMS_STATUSES).optional(),
  brokerId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)).optional(),
  brokerName: z.string().trim().max(120).optional(),
  brokerCompany: z.string().trim().max(160).optional(),
  documents: z.array(z.unknown()).optional(),
  billOfEntryNumber: z.string().trim().max(120).optional(),
  billOfEntryDate: z.coerce.date().optional(),
  customsStation: z.string().trim().max(160).optional(),
  assessmentDate: z.coerce.date().optional(),
  clearanceDate: z.coerce.date().optional(),
  complianceStatus: z.enum(['compliant', 'non_compliant', 'review_required']).optional(),
  holdReason: z.string().trim().max(1000).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'refunded']).optional(),
  paymentReference: z.string().trim().max(160).optional(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().trim().max(3000).optional(),
}).strict();

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}