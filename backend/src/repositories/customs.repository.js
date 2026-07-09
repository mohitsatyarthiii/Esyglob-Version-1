import CustomsClearance from '../models/CustomsClearance.js';
import ShippingOrder from '../models/ShippingOrder.js';
import mongoose from 'mongoose';

class CustomsRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find clearances with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [clearances, total] = await Promise.all([
      CustomsClearance.find(query)
        .populate('userId', 'email fullName')
        .populate('shipmentId', 'orderNumber trackingNumber')
        .populate('brokerId', 'email fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CustomsClearance.countDocuments(query),
    ]);

    return {
      clearances,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find single clearance
   */
  static async findOne(query) {
    return CustomsClearance.findOne(query)
      .populate('userId', 'email fullName')
      .populate('shipmentId', 'orderNumber trackingNumber')
      .populate('brokerId', 'email fullName')
      .lean();
  }

  /**
   * Create clearance
   */
  static async create(data) {
    return CustomsClearance.create(data);
  }

  /**
   * Find and update clearance
   */
  static async findOneAndUpdate(query, data) {
    return CustomsClearance.findOneAndUpdate(
      query,
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Update related shipping order when clearance is created
   */
  static async updateShippingOrder(shipmentId) {
    if (!shipmentId || !this.isValidId(shipmentId)) return;

    await ShippingOrder.findByIdAndUpdate(shipmentId, {
      'customs.broker': 'Assigned',
      'customs.clearanceStatus': 'pending',
    });
  }
}

export default CustomsRepository;