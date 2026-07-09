import { z } from 'zod';
import mongoose from 'mongoose';

export const INSPECTION_TYPES = ['pre_shipment', 'during_production', 'container_loading', 'lab_testing'];
export const INSPECTION_STATUSES = ['pending', 'inspector_assigned', 'scheduled', 'in_progress', 'completed', 'report_ready', 'approved', 'rejected', 'cancelled'];

export const inspectionCreateSchema = z.object({
  type: z.enum(INSPECTION_TYPES),
  supplierName: z.string().trim().max(160).optional(),
  factoryName: z.string().trim().max(160).optional(),
  factoryAddress: z.object({
    address: z.string().trim().min(1).max(500),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().max(40).optional(),
  }),
  contactPerson: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(60).optional(),
  contactEmail: z.string().trim().email().optional(),
  products: z.array(z.object({
    name: z.string().trim().max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    quantity: z.coerce.number().min(0).optional().default(0),
    unit: z.string().trim().max(40).optional(),
    specifications: z.string().trim().max(1000).optional(),
    hsCode: z.string().trim().max(40).optional(),
    samplePhotos: z.array(z.string()).optional(),
  }).passthrough()).min(1),
  requestedDate: z.coerce.date().optional(),
  standard: z.string().trim().max(120).optional(),
  specialRequirements: z.string().trim().max(3000).optional(),
});

export const inspectionPatchSchema = z.object({
  status: z.enum(INSPECTION_STATUSES).optional(),
  scheduledDate: z.coerce.date().optional(),
  completedDate: z.coerce.date().optional(),
  inspectorId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)).optional(),
  inspectorName: z.string().trim().max(120).optional(),
  inspectorCompany: z.string().trim().max(160).optional(),
  result: z.enum(['pass', 'fail', 'conditional']).optional(),
  defectRate: z.coerce.number().min(0).optional(),
  criticalDefects: z.coerce.number().min(0).optional(),
  majorDefects: z.coerce.number().min(0).optional(),
  minorDefects: z.coerce.number().min(0).optional(),
  reportUrl: z.string().trim().max(1000).optional(),
  reportPhotos: z.array(z.string().trim().max(1000)).optional(),
  reportSummary: z.string().trim().max(5000).optional(),
  reportDate: z.coerce.date().optional(),
  travelExpenses: z.coerce.number().min(0).optional(),
  totalCost: z.coerce.number().min(0).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'refunded']).optional(),
  notes: z.string().trim().max(3000).optional(),
}).strict();

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}