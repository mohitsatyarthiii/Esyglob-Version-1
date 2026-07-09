import { z } from 'zod';

export const CONSULTING_TYPES = [
  'market_entry', 'supply_chain', 'sourcing', 'export_readiness',
  'trade_finance', 'compliance', 'custom',
];

export const CONSULTING_STATUSES = [
  'inquiry', 'proposal_sent', 'proposal_accepted', 'in_progress',
  'delivered', 'completed', 'cancelled',
];

export const consultingInquirySchema = z.object({
  type: z.enum(CONSULTING_TYPES),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(5000),
  objectives: z.array(z.string().trim().max(500)).optional().default([]),
  scope: z.object({
    deliverables: z.array(z.string().trim().max(500)).optional().default([]),
    methodology: z.string().trim().max(1000).optional(),
  }).optional().default({}),
  preferredTimeline: z.object({
    start: z.coerce.date().optional(),
    duration: z.string().trim().max(120).optional(),
  }).optional().default({}),
  budget: z.coerce.number().min(0).optional().default(0),
  currency: z.string().trim().min(3).max(8).optional().default('USD'),
});

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}