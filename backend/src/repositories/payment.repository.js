import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';

class PaymentRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find payment by ID
   */
  static async findById(paymentId) {
    if (!this.isValidId(paymentId)) return null;
    return Payment.findById(paymentId);
  }

  /**
   * Find payment by ID (lean)
   */
  static async findByIdLean(paymentId) {
    if (!this.isValidId(paymentId)) return null;
    return Payment.findById(paymentId).lean();
  }

  /**
   * Find pending payment for order
   */
  static async findPendingForOrder(orderId, userId) {
    return Payment.findOne({
      orderId,
      userId,
      paymentFor: 'order',
      status: { $in: ['initiated', 'pending', 'processing'] },
    }).sort({ createdAt: -1 });
  }

  /**
   * Find payment by Razorpay payment ID
   */
  static async findByRazorpayPaymentId(razorpayPaymentId) {
    return Payment.findOne({ razorpayPaymentId });
  }

  /**
   * Create payment record
   */
  static async create(data) {
    return Payment.create(data);
  }

  /**
   * Save payment
   */
  static async save(payment) {
    return payment.save();
  }

  /**
   * Find order by ID
   */
  static async findOrderById(orderId) {
    if (!this.isValidId(orderId)) return null;
    return Order.findById(orderId);
  }
}

export default PaymentRepository;