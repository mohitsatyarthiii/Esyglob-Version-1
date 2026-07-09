import { z } from 'zod';

export const ticketSchema = z.object({
  issueType: z.enum([
    'account', 'login', 'verification', 'seller_onboarding',
    'product', 'supplier', 'order', 'payment', 'shipping',
    'service', 'complaint', 'other',
  ]).optional().default('other'),
  subject: z.string().trim().min(4).max(140),
  description: z.string().trim().min(10).max(4000),
  roleContext: z.enum(['buyer', 'seller', 'admin', 'general']).optional().default('general'),
  relatedModel: z.string().trim().optional(),
  relatedId: z.string().trim().optional(),
  aiChatId: z.string().trim().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  metadata: z.any().optional(),
});

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}