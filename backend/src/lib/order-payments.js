import Payment from '../models/Payment.js';

/**
 * Ensure a pending payment record exists for an order
 */
export async function ensurePendingOrderPayment(order, { userId, amount, currency = 'INR' } = {}) {
  if (!order?._id) return null;

  // Check for existing pending payment
  let payment = await Payment.findOne({
    orderId: order._id,
    userId,
    paymentFor: 'order',
    status: { $in: ['initiated', 'pending', 'processing'] },
  }).sort({ createdAt: -1 });

  if (payment) {
    // Update amount if changed
    if (amount && payment.amount !== amount) {
      payment.amount = amount;
      payment.currency = currency;
      await payment.save();
    }
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
    amount: amount || Number(order.totalPrice || order.totalAmount || 0),
    currency,
    status: 'initiated',
    paymentDate: new Date(),
  });

  return payment;
}