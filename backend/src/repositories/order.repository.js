import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';

class OrderRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find order by ID with full population
   */
  static async findByIdFull(orderId) {
    if (!this.isValidId(orderId)) return null;

    return Order.findById(orderId)
      .populate('buyerId', 'email fullName firstName lastName avatarUrl avatar profileImage phone')
      .populate({
        path: 'sellerId',
        select: 'companyName companyType isVerified userId companyLogo logo logoUrl',
        populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
      })
      .populate('productId', 'name images description price')
      .populate('rfqId')
      .populate('quotationId')
      .populate('chatId');
  }

  /**
   * Find order by ID lean
   */
  static async findByIdLean(orderId) {
    if (!this.isValidId(orderId)) return null;
    return Order.findById(orderId).lean();
  }

  /**
   * List orders for buyer
   */
  static async findByBuyer(userId, { status, orderType, limit = 50 } = {}) {
    const query = {
      $or: [{ buyerId: userId }, { userId }],
    };

    if (status && status !== 'all') query.status = String(status).trim().slice(0, 40);
    if (orderType && orderType !== 'all') query.orderType = String(orderType).trim().slice(0, 40);

    return Order.find(query)
      .populate('buyerId', 'email fullName firstName lastName avatarUrl')
      .populate({
        path: 'sellerId',
        select: 'companyName companyType isVerified userId companyLogo logo logoUrl',
        populate: { path: 'userId', select: 'fullName avatarUrl' },
      })
      .populate('productId', 'name images price unit category')
      .populate('paymentId', 'paymentNumber status amount currency transactionId razorpayPaymentId createdAt paidAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();
  }

  /**
   * List orders for seller
   */
  static async findBySeller(sellerId, { status, orderType, limit = 50 } = {}) {
    const query = { sellerId };

    if (status && status !== 'all') query.status = String(status).trim().slice(0, 40);
    if (orderType && orderType !== 'all') query.orderType = String(orderType).trim().slice(0, 40);

    return Order.find(query)
      .populate('buyerId', 'email fullName firstName lastName avatarUrl')
      .populate({
        path: 'sellerId',
        select: 'companyName companyType isVerified userId companyLogo logo logoUrl',
        populate: { path: 'userId', select: 'fullName avatarUrl' },
      })
      .populate('productId', 'name images price unit category')
      .populate('paymentId', 'paymentNumber status amount currency transactionId razorpayPaymentId createdAt paidAt')
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();
  }

  /**
   * Find seller by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id').lean();
  }

  /**
   * Find product with seller
   */
  static async findProductWithSeller(productId) {
    if (!this.isValidId(productId)) return null;

    return Product.findById(productId)
      .populate('sellerId', 'userId companyName companyType isVerified isTrustedSeller trustedSellerBadge isActive isSuspended address businessEmail businessPhone gstNumber businessRegistrationNumber')
      .lean();
  }

  /**
   * Generate order number
   */
  static async generateOrderNumber(prefix = 'ORD') {
    const count = await Order.countDocuments();
    return `${prefix}${String(count + 1).padStart(8, '0')}`;
  }

  /**
   * Create order
   */
  static async create(data) {
    return Order.create(data);
  }

  /**
   * Save order
   */
  static async save(order) {
    return order.save();
  }
}

export default OrderRepository;