import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';
import mongoose from 'mongoose';
import crypto from 'crypto';

function normalizeLimit(limit, fallback = 50, max = 100) {
  const value = Number(limit);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), max) : fallback;
}

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
      .populate('chatId')
      .exec();
  }

  /**
   * Find order by ID lean
   */
  static async findByIdLean(orderId) {
    if (!this.isValidId(orderId)) return null;
    return Order.findById(orderId).lean().exec();
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
      .limit(normalizeLimit(limit))
      .lean()
      .exec();
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
      .limit(normalizeLimit(limit))
      .lean()
      .exec();
  }

  /**
   * Find seller by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id').lean().exec();
  }

  /**
   * Find product with seller
   */
  static async findProductWithSeller(productId) {
    if (!this.isValidId(productId)) return null;

    return Product.findById(productId)
      .populate('sellerId', 'userId companyName companyType isVerified isTrustedSeller trustedSellerBadge isActive isSuspended address businessEmail businessPhone gstNumber businessRegistrationNumber')
      .lean()
      .exec();
  }

  /**
   * Generate order number
   */
  static async generateOrderNumber(prefix = 'ORD') {
    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = crypto.randomInt(1000, 10000);
    return `${prefix}${timePart}${randomPart}`;
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
