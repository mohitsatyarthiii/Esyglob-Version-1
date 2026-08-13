import Shipment from '../models/Shipment.js';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import mongoose from 'mongoose';

class ShipmentRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find seller by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id userId').lean();
  }

  /**
   * Find order by ID and seller
   */
  static async findOrderBySeller(orderId, sellerId) {
    if (!this.isValidId(orderId)) return null;
    return Order.findOne({ _id: orderId, sellerId });
  }

  /**
   * Get shipments for user (buyer or seller)
   */
  static async findByUser(userId) {
    return Shipment.find({
      $or: [{ buyerId: userId }, { sellerUserId: userId }],
    })
      .populate('orderId', 'orderNumber status totalPrice currency')
      .sort({ createdAt: -1 })
      .lean();
  }
  static async findAll(limit = 200) {
    return Shipment.find({})
      .populate('orderId', 'orderNumber status paymentStatus totalPrice currency shippingAddress timeline')
      .populate('sellerId', 'companyName businessEmail businessPhone')
      .populate('buyerId', 'fullName email companyName')
      .sort({ updatedAt: -1 }).limit(Math.min(Number(limit) || 200, 500)).lean();
  }

  /**
   * Create shipment
   */
  static async create(data) {
    return Shipment.create(data);
  }

  /**
   * Save order
   */
  static async saveOrder(order) {
    return order.save();
  }
}

export default ShipmentRepository;
