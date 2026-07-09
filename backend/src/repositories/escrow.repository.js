import EscrowTransaction from '../models/EscrowTransaction.js';
import Seller from '../models/Seller.js';
import mongoose from 'mongoose';

class EscrowRepository {
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
    return Seller.findOne({ userId }).select('_id').lean();
  }

  /**
   * Find seller by ID
   */
  static async findSellerById(sellerId) {
    if (!this.isValidId(sellerId)) return null;
    return Seller.findById(sellerId).select('userId companyName').lean();
  }

  /**
   * Find transactions with pagination
   */
  static async findWithPagination(query, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      EscrowTransaction.find(query)
        .populate('orderId', 'orderNumber totalAmount')
        .populate('sellerId', 'companyName userId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EscrowTransaction.countDocuments(query),
    ]);

    return {
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find active escrow for an order
   */
  static async findActiveByOrder(orderId) {
    return EscrowTransaction.findOne({
      orderId,
      status: { $nin: ['cancelled', 'refunded'] },
    })
      .select('_id')
      .lean();
  }

  /**
   * Find escrow by ID
   */
  static async findById(transactionId) {
    if (!this.isValidId(transactionId)) return null;
    return EscrowTransaction.findById(transactionId);
  }

  /**
   * Find escrow by ID with populated fields
   */
  static async findByIdPopulated(transactionId) {
    if (!this.isValidId(transactionId)) return null;

    return EscrowTransaction.findById(transactionId)
      .populate('userId', 'email fullName')
      .populate('sellerId', 'companyName userId')
      .populate('orderId', 'orderNumber totalAmount totalPrice status')
      .lean();
  }

  /**
   * Create escrow transaction
   */
  static async create(data) {
    return EscrowTransaction.create(data);
  }

  /**
   * Save escrow transaction
   */
  static async save(transaction) {
    return transaction.save();
  }

  /**
   * Check if user can access escrow (buyer, seller, or admin)
   */
  static async canAccess(transaction, session) {
    if (session.roles?.includes('admin')) return true;
    if (String(transaction.userId) === session.userId) return true;
    if (!transaction.sellerId) return false;

    const seller = await Seller.findOne({
      _id: transaction.sellerId,
      userId: session.userId,
    }).select('_id').lean();

    return Boolean(seller);
  }
}

export default EscrowRepository;