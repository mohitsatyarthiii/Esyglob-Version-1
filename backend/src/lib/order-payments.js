import Payment from '../models/Payment.js';
import { resolveOrderPayableAmount } from './order-totals.js';
import { calculateOrderPlatformFee, getOrderBaseAmount, getPlatformFeeRate } from './platform-fees.js';

/**
 * Ensure a pending payment record exists for an order
 */
export async function ensurePendingOrderPayment(order, { userId, amount, currency = 'INR' } = {}) {
  if (!order?._id) return null;
  const payableAmount = Number(amount) > 0 ? Number(amount) : resolveOrderPayableAmount(order);
  const orderAmount = getOrderBaseAmount(order);
  const platformFee = Number(order.platformFee ?? calculateOrderPlatformFee(order));
  const gatewayFee = Number(order.gatewayFee || 0);

  // Check for existing pending payment
  let payment = await Payment.findOne({
    orderId: order._id,
    userId,
    paymentFor: 'order',
    status: { $in: ['initiated', 'pending', 'processing'] },
  }).sort({ createdAt: -1 });

  if (payment) {
    // Update amount if changed
    payment.amount = payableAmount;
    payment.orderAmount = orderAmount;
    payment.platformFeeRate = platformFee ? getPlatformFeeRate(orderAmount) : 0;
    payment.platformFee = platformFee;
    payment.gatewayFee = gatewayFee;
    payment.netAmount = payableAmount - platformFee - gatewayFee;
    payment.currency = currency || order.currency || 'INR';
    await payment.save();
    return payment;
  }

  // Create new payment record
  payment = await Payment.create({
    userId,
    orderId: order._id,
    paymentFor: 'order',
    type: 'order_payment',
    method: 'razorpay',
    paymentMethod: 'razorpay',
    amount: payableAmount,
    orderAmount,
    platformFeeRate: platformFee ? getPlatformFeeRate(orderAmount) : 0,
    platformFee,
    gatewayFee,
    netAmount: payableAmount - platformFee - gatewayFee,
    currency: currency || order.currency || 'INR',
    status: 'initiated',
    paymentDate: new Date(),
  });

  return payment;
}
