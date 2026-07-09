import EscrowRepository from '../repositories/escrow.repository.js';
import NotificationService from './notification.service.js';
import {
  escrowCreateSchema,
  escrowPatchSchema,
  ESCROW_STATUSES,
  toPositiveInt,
} from '../validators/escrow.validator.js';

class EscrowService {
  /**
   * List escrow transactions
   */
  static async listTransactions(userId, query = {}) {
    const { status, orderId, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = { userId };

    if (status && status !== 'all' && ESCROW_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (orderId && EscrowRepository.isValidId(orderId)) {
      dbQuery.orderId = orderId;
    }

    return EscrowRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * Create escrow agreement
   */
  static async createEscrow(userId, data) {
    // Validate
    const parsed = escrowCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields: amount, sellerId'),
        { statusCode: 400 }
      );
    }

    const {
      sellerId, orderId, description, amount, currency,
      milestones, paymentMethod, terms, inspectionPeriod,
    } = parsed.data;

    // Verify seller exists
    const seller = await EscrowRepository.findSellerById(sellerId);
    if (!seller) {
      throw Object.assign(new Error('Seller not found'), { statusCode: 404 });
    }

    // Check for existing active escrow on this order
    if (orderId) {
      const existingEscrow = await EscrowRepository.findActiveByOrder(orderId);
      if (existingEscrow) {
        throw Object.assign(
          new Error('Active escrow already exists for this order'),
          { statusCode: 409, escrowId: existingEscrow._id }
        );
      }
    }

    // Default milestones if not provided
    const defaultMilestones = milestones?.length ? milestones : [
      {
        title: 'Order Confirmation',
        percentage: 30,
        amount: amount * 0.3,
        condition: 'After order confirmation',
      },
      {
        title: 'Production Complete',
        percentage: 40,
        amount: amount * 0.4,
        condition: 'After production and quality check',
      },
      {
        title: 'Delivery Confirmed',
        percentage: 30,
        amount: amount * 0.3,
        condition: 'After delivery and inspection',
      },
    ];

    // Calculate fees
    const escrowFee = amount < 10000 ? 0 : Math.round(amount * 0.005 * 100) / 100;
    const platformFee = Math.round(amount * 0.01 * 100) / 100;

    // Create escrow
    const transaction = await EscrowRepository.create({
      userId,
      sellerId,
      orderId: orderId || null,
      description,
      amount,
      currency: currency || 'USD',
      milestones: defaultMilestones.map(m => ({
        ...m,
        amount: m.amount || (amount * m.percentage / 100),
        status: 'pending',
      })),
      paymentMethod: paymentMethod || 'bank_transfer',
      terms,
      inspectionPeriod: inspectionPeriod || 7,
      escrowFee,
      platformFee,
      status: 'pending_seller',
    });

    // Notify seller
    await NotificationService.createNotification({
      userId: seller.userId,
      notificationType: 'escrow_created',
      title: 'New Escrow Agreement',
      description: `A buyer has created an escrow agreement for ${currency || 'USD'} ${amount}. Please review and accept.`,
      data: {
        relatedId: transaction._id,
        relatedModel: 'EscrowTransaction',
        actionUrl: `/dashboard/seller/escrow/${transaction._id}`,
      },
      priority: 'high',
    }).catch(err => console.error('Escrow notification error:', err));

    // Notify buyer
    await NotificationService.createNotification({
      userId,
      notificationType: 'escrow_created',
      title: 'Escrow Agreement Created',
      description: `Escrow agreement ${transaction.transactionNumber} created. Waiting for seller acceptance.`,
      data: {
        relatedId: transaction._id,
        relatedModel: 'EscrowTransaction',
        actionUrl: `/dashboard/buyer/escrow/${transaction._id}`,
      },
      priority: 'medium',
    }).catch(err => console.error('Escrow notification error:', err));

    return { transaction, message: 'Escrow agreement created successfully' };
  }

  /**
   * Get single escrow detail
   */
  static async getEscrow(session, transactionId) {
    const transaction = await EscrowRepository.findByIdPopulated(transactionId);
    if (!transaction) {
      throw Object.assign(new Error('Escrow transaction not found'), { statusCode: 404 });
    }

    const canAccess = await EscrowRepository.canAccess(transaction, session);
    if (!canAccess) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }

    return { transaction };
  }

  /**
   * Update escrow (deposit/approve/dispute)
   */
  static async updateEscrow(session, transactionId, data) {
    // Validate
    const parsed = escrowPatchSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid update data'), { statusCode: 400 });
    }

    const body = parsed.data;

    // Find transaction
    const transaction = await EscrowRepository.findById(transactionId);
    if (!transaction) {
      throw Object.assign(new Error('Escrow transaction not found'), { statusCode: 404 });
    }

    // Check access
    const canAccess = await EscrowRepository.canAccess(transaction, session);
    if (!canAccess) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }

    // Perform action
    if (body.action === 'deposit') {
      transaction.status = 'funded';
      transaction.fundedAt = new Date();
      transaction.paymentReference = body.paymentReference || transaction.paymentReference || 'manual-pending';
    } else if (body.action === 'approve') {
      transaction.status = 'completed';
      transaction.releasedAmount = transaction.amount;
      transaction.releasedAt = new Date();
      transaction.milestones = transaction.milestones.map(milestone => ({
        ...(milestone.toObject?.() || milestone),
        status: 'released',
        releasedAt: milestone.releasedAt || new Date(),
      }));
    } else if (body.action === 'dispute') {
      transaction.status = 'disputed';
      transaction.notes = [transaction.notes, body.reason].filter(Boolean).join('\n');
    } else if (body.status) {
      transaction.status = body.status;
    }

    await EscrowRepository.save(transaction);

    // Notify buyer
    await NotificationService.createNotification({
      userId: transaction.userId,
      notificationType: body.action === 'dispute' ? 'dispute_filed' : 'escrow_funded',
      title: 'Escrow Updated',
      description: `Escrow ${transaction.transactionNumber} is now ${transaction.status}.`,
      data: {
        relatedId: transaction._id,
        relatedModel: 'EscrowTransaction',
        actionUrl: `/dashboard/buyer/escrow/${transaction._id}`,
      },
    }).catch(err => console.error('Escrow notification error:', err));

    return { transaction };
  }
}

export default EscrowService;