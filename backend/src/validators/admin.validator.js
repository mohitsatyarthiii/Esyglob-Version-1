import { z } from 'zod';

export const adminMutationSchema = z.record(z.string().min(1).max(80), z.unknown())
  .refine((input) => Object.keys(input).length > 0, 'At least one field is required')
  .refine((input) => Object.keys(input).length <= 60, 'Too many fields were provided');

export const adminActionSchema = z.object({
  action: z.enum([
    'activate', 'suspend', 'approve', 'reject', 'feature', 'hide', 'restore',
    'cancel', 'refund', 'mark_paid', 'retry', 'generate_invoice', 'add_note', 'update_tracking',
    'enable', 'disable', 'duplicate', 'reorder', 'bulk_status', 'update_status',
  ]),
  reason: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.string().trim().max(80).optional(),
  amount: z.coerce.number().positive().optional(),
  reference: z.string().trim().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  ids: z.array(z.string().trim().min(1)).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((input, context) => {
  if (['suspend', 'reject', 'refund', 'cancel'].includes(input.action) && !input.reason) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required for this action' });
  }
  if (input.action === 'bulk_status' && (!input.ids?.length || !input.status)) {
    context.addIssue({ code: 'custom', path: ['ids'], message: 'Record IDs and status are required' });
  }
  if (input.action === 'update_status' && !input.status) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Order status is required' });
  }
  if (['mark_paid', 'update_tracking'].includes(input.action) && !input.reference) {
    context.addIssue({ code: 'custom', path: ['reference'], message: 'A reference is required' });
  }
  if (input.action === 'add_note' && !input.notes) {
    context.addIssue({ code: 'custom', path: ['notes'], message: 'The note cannot be empty' });
  }
  if (input.action === 'reorder' && input.sortOrder === undefined) {
    context.addIssue({ code: 'custom', path: ['sortOrder'], message: 'Sort order is required' });
  }
});

export const documentReviewSchema = z.object({
  status: z.enum(['under_review', 'verified', 'rejected', 'needs_update']),
  reason: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
}).superRefine((input, context) => {
  if (['rejected', 'needs_update'].includes(input.status) && !input.reason && !input.notes) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A rejection or revision reason is required' });
  }
});
