import { z } from 'zod';
import mongoose from 'mongoose';

export const shipmentCreateSchema = z.object({
  orderId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value), {
    message: 'Invalid order ID',
  }),
  provider: z.string().trim().max(60).optional().default('manual'),
  trackingNumber: z.string().trim().max(120).optional(),
  estimatedDeliveryAt: z.coerce.date().optional(),
  serviceLevel: z.string().trim().max(120).optional(),
});