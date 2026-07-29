import { ensurePendingOrderPayment as ensureOrderPayment } from './order-payments.js';

export const PAID_ORDER_STATUSES = [
  'payment_confirmed', 'confirmed', 'processing', 'production',
  'ready_to_ship', 'shipped', 'delivered', 'completed',
];

export function isOrderPaid(order) {
  return (
    order?.paymentStatus === 'paid' ||
    PAID_ORDER_STATUSES.includes(order?.status)
  );
}

export function paidOrderMatch(extra = {}) {
  return {
    ...extra,
    $or: [
      { paymentStatus: 'paid' },
      { status: { $in: PAID_ORDER_STATUSES } },
    ],
  };
}

export async function ensurePendingOrderPayment(
  order,
  { userId, amount, currency = 'INR' } = {}
) {
  return ensureOrderPayment(order, {
    userId: userId || order?.buyerId || order?.userId,
    amount,
    currency: currency || order?.currency || 'INR',
  });
}
