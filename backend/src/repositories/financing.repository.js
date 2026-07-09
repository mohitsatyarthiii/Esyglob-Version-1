import TradeFinancing from '../models/TradeFinancing.js';
import mongoose from 'mongoose';

class FinancingRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find applications with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      TradeFinancing.find(query)
        .populate('userId', 'email fullName')
        .populate('supplierId', 'companyName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TradeFinancing.countDocuments(query),
    ]);

    return {
      applications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find single application
   */
  static async findOne(query) {
    return TradeFinancing.findOne(query)
      .populate('userId', 'email fullName')
      .populate('supplierId', 'companyName')
      .lean();
  }

  /**
   * Create application
   */
  static async create(data) {
    return TradeFinancing.create(data);
  }

  /**
   * Find and update application
   */
  static async findOneAndUpdate(query, data) {
    return TradeFinancing.findOneAndUpdate(
      query,
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Save application
   */
  static async save(application) {
    return application.save();
  }
}

export default FinancingRepository;