import { z } from 'zod';
import mongoose from 'mongoose';

export const INVENTORY_STATUSES = ['active', 'quarantine', 'expired', 'disposed'];
export const WAREHOUSE_ORDER_STATUSES = ['pending', 'processing', 'picking', 'packing', 'shipped', 'delivered', 'cancelled'];
export const WAREHOUSE_ORDER_TYPES = ['inbound', 'outbound', 'return', 'transfer'];

export const addInventorySchema = z.object({
  action: z.literal('add_inventory'),
  warehouseId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)),
  sku: z.string().trim().min(1).max(120),
  productName: z.string().trim().max(200).optional(),
  quantity: z.coerce.number().min(1),
  unitValue: z.coerce.number().min(0).optional(),
  storageType: z.enum(['standard', 'climate_controlled', 'cold_storage', 'hazardous', 'high_value']).optional(),
});

export const createWarehouseOrderSchema = z.object({
  action: z.literal('create_order'),
  warehouseId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)),
  type: z.enum(WAREHOUSE_ORDER_TYPES),
  items: z.array(z.object({
    inventoryId: z.string().refine(value => mongoose.Types.ObjectId.isValid(value)),
    sku: z.string().trim().max(120).optional(),
    productName: z.string().trim().max(200).optional(),
    quantity: z.coerce.number().min(1),
  }).passthrough()).min(1),
  shippingAddress: z.unknown().optional(),
  specialInstructions: z.string().trim().max(3000).optional(),
});

export const warehouseOperationSchema = z.discriminatedUnion('action', [
  addInventorySchema,
  createWarehouseOrderSchema,
]);

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}