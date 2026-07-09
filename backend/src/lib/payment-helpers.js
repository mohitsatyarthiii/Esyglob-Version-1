import Payment from '../models/Payment.js';
import { calculateOrderPlatformFee, getOrderBaseAmount, getPlatformFeeRate } from './platform-fees.js';

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
  if (!order?._id) return null;

  const baseAmount = getOrderBaseAmount(order);
  const platformFee = Number(
    order.platformFee ?? calculateOrderPlatformFee(order)
  );
  const totalAmount = Number(
    amount ||
      order.totalPrice ||
      order.totalAmount ||
      baseAmount + platformFee ||
      0
  );

  const existing = await Payment.findOne({
    orderId: order._id,
    paymentFor: 'order',
    status: { $in: ['initiated', 'pending', 'processing'] },
  }).sort({ createdAt: -1 });

  if (existing) {
    existing.orderAmount = existing.orderAmount ?? baseAmount;
    existing.platformFeeRate =
      existing.platformFeeRate ??
      (platformFee ? getPlatformFeeRate(baseAmount) : 0);
    existing.platformFee = existing.platformFee ?? platformFee;
    existing.gatewayFee =
      existing.gatewayFee ?? Number(order.gatewayFee || 0);
    existing.netAmount = Number(
      existing.netAmount ??
        totalAmount -
          platformFee -
          Number(existing.gatewayFee || order.gatewayFee || 0)
    );
    existing.amount = totalAmount;
    await existing.save();
    return existing;
  }

  return Payment.create({
    userId: userId || order.buyerId || order.userId,
    paymentFor: 'order',
    orderId: order._id,
    amount: totalAmount,
    orderAmount: baseAmount,
    platformFeeRate: platformFee ? getPlatformFeeRate(baseAmount) : 0,
    platformFee,
    gatewayFee: Number(order.gatewayFee || 0),
    netAmount:
      totalAmount - platformFee - Number(order.gatewayFee || 0),
    currency: currency || order.currency || 'INR',
    type: 'order_payment',
    method: 'razorpay',
    paymentMethod: 'razorpay',
    gateway: 'razorpay',
    status: 'pending',
    paymentDate: new Date(),
  });
}