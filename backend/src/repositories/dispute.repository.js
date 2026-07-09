import Dispute from '../models/Dispute.js';
import Order from '../models/Order.js';
import EscrowTransaction from '../models/EscrowTransaction.js';
import mongoose from 'mongoose';

class DisputeRepository {
  /**
   * Check valid ObjectId
   */
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Find disputes with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [disputes, total] = await Promise.all([
      Dispute.find(query)
        .populate('initiatorId', 'email fullName')
        .populate('respondentId', 'email fullName')
        .populate('mediatorId', 'email fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(query),
    ]);

    return {
      disputes,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find dispute by ID
   */
  static async findById(disputeId) {
    if (!this.isValidId(disputeId)) return null;
    return Dispute.findById(disputeId);
  }

  /**
   * Find dispute by ID with populated fields
   */
  static async findByIdPopulated(disputeId) {
    if (!this.isValidId(disputeId)) return null;

    return Dispute.findById(disputeId)
      .populate('initiatorId', 'email fullName')
      .populate('respondentId', 'email fullName')
      .populate('mediatorId', 'email fullName')
      .lean();
  }

  /**
   * Find active dispute for a transaction
   */
  static async findActiveByTransaction(transactionType, transactionId) {
    return Dispute.findOne({
      transactionType,
      transactionId,
      status: { $nin: ['closed', 'resolved'] },
    })
      .select('_id')
      .lean();
  }

  /**
   * Create dispute
   */
  static async create(data) {
    return Dispute.create(data);
  }

  /**
   * Save dispute
   */
  static async save(dispute) {
    return dispute.save();
  }

  /**
   * Update related transaction when dispute is filed
   */
  static async updateRelatedTransaction(transactionType, transactionId, disputeId) {
    if (transactionType === 'escrow') {
      await EscrowTransaction.findByIdAndUpdate(transactionId, {
        status: 'disputed',
        disputeId,
      });
    } else if (transactionType === 'order') {
      await Order.findByIdAndUpdate(transactionId, {
        disputeId,
      });
    }
  }

  /**
   * Check if user can access dispute
   */
  static canAccess(dispute, session) {
    if (session.roles?.includes('admin')) return true;
    return (
      String(dispute.initiatorId) === session.userId ||
      String(dispute.respondentId) === session.userId
    );
  }
}

export default DisputeRepository;