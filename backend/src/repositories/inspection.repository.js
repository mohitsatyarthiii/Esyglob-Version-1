import QualityInspection from '../models/QualityInspection.js';
import mongoose from 'mongoose';

class InspectionRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find inspections with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [inspections, total] = await Promise.all([
      QualityInspection.find(query)
        .populate('userId', 'email fullName')
        .populate('inspectorId', 'email fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      QualityInspection.countDocuments(query),
    ]);

    return {
      inspections,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find single inspection
   */
  static async findOne(query) {
    return QualityInspection.findOne(query)
      .populate('userId', 'email fullName')
      .populate('inspectorId', 'email fullName')
      .lean();
  }

  /**
   * Create inspection
   */
  static async create(data) {
    return QualityInspection.create(data);
  }

  /**
   * Find and update inspection
   */
  static async findOneAndUpdate(query, data) {
    return QualityInspection.findOneAndUpdate(
      query,
      { $set: data },
      { new: true, runValidators: true }
    );
  }

  /**
   * Save inspection
   */
  static async save(inspection) {
    return inspection.save();
  }
}

export default InspectionRepository;