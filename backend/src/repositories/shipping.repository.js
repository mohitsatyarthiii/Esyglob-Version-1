import ShippingOrder from '../models/ShippingOrder.js';
import mongoose from 'mongoose';

class ShippingRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find shipments with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [shipments, total] = await Promise.all([
      ShippingOrder.find(query)
        .populate('userId', 'email fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ShippingOrder.countDocuments(query),
    ]);

    return {
      shipments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find shipment by ID
   */
  static async findById(shipmentId) {
    if (!this.isValidId(shipmentId)) return null;
    return ShippingOrder.findById(shipmentId);
  }

  /**
   * Find shipment by ID (lean)
   */
  static async findByIdLean(shipmentId) {
    if (!this.isValidId(shipmentId)) return null;
    return ShippingOrder.findById(shipmentId)
      .populate('userId', 'email fullName')
      .lean();
  }

  /**
   * Create shipment
   */
  static async create(data) {
    return ShippingOrder.create(data);
  }

  /**
   * Save shipment
   */
  static async save(shipment) {
    return shipment.save();
  }

  /**
   * Count documents (for order number generation - handled by model pre-save)
   */
  static async count() {
    return ShippingOrder.countDocuments();
  }
}

export default ShippingRepository;