import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import PaymentMethod from '../models/PaymentMethod.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import EscrowTransaction from '../models/EscrowTransaction.js';
import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import mongoose from 'mongoose';

class WalletRepository {
  /**
   * Get or create wallet
   */
  static async getOrCreateWallet({ userId, role, sellerId, currency = 'INR' }) {
    return Wallet.findOneAndUpdate(
      { userId, role },
      { $setOnInsert: { userId, role, sellerId, currency } },
      { upsert: true, new: true }
    );
  }

  /**
   * Find seller by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).lean();
  }

  /**
   * Get wallet transactions
   */
  static async getTransactions(walletId, limit = 100) {
    return WalletTransaction.find({ walletId })
      .select('walletId userId sellerId role type direction amount currency status paymentId orderId withdrawalId description metadata createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get payment methods
   */
  static async getPaymentMethods(userId, role) {
    return PaymentMethod.find({ userId, role })
      .select('userId role type label isDefault holderName bankName ifsc maskedAccountNumber upiId cardBrand cardLast4 cardExpiryMonth cardExpiryYear verificationStatus verificationMessage createdAt updatedAt')
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();
  }

  /**
   * Get withdrawal requests
   */
  static async getWithdrawals(userId, walletId, limit = 50) {
    return WithdrawalRequest.find({ userId, walletId })
      .select('userId walletId paymentMethodId amount currency status adminNotes rejectionReason reviewedAt paidAt createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get pending withdrawals total
   */
  static async getPendingWithdrawalAmount(userId, walletId) {
    const withdrawals = await WithdrawalRequest.find({
      userId,
      walletId,
      status: { $in: ['pending', 'approved'] },
    }).lean();
    return withdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);
  }

  /**
   * Get escrow transactions
   */
  static async getEscrowTransactions(query, limit = 50) {
    return EscrowTransaction.find(query)
      .select('userId buyerId sellerId orderId amount currency status releaseStatus createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get payments
   */
  static async getPayments(userId, limit = 75) {
    return Payment.find({ userId })
      .select('userId orderId subscriptionId paymentFor amount currency status paymentMethod transactionId paymentNumber createdAt paidAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get orders
   */
  static async getOrders(query, limit = 75) {
    return Order.find(query)
      .select('buyerId sellerId productId orderNumber orderType orderSubType status paymentStatus totalAmount totalPrice currency quantity createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Find payment method by ID
   */
  static async findPaymentMethod(methodId, userId, role) {
    if (!mongoose.Types.ObjectId.isValid(methodId)) return null;

    return PaymentMethod.findOne({
      _id: methodId,
      userId,
      role,
      type: { $in: ['bank_account', 'upi'] },
      verificationStatus: 'verified',
    });
  }

  /**
   * Create payment method
   */
  static async createPaymentMethod(data) {
    return PaymentMethod.create(data);
  }

  /**
   * Unset default payment methods
   */
  static async unsetDefaultPaymentMethods(userId, role) {
    return PaymentMethod.updateMany(
      { userId, role },
      { $set: { isDefault: false } }
    );
  }

  /**
   * Create withdrawal request
   */
  static async createWithdrawal(data) {
    return WithdrawalRequest.create(data);
  }

  /**
   * Create wallet transaction
   */
  static async createTransaction(data) {
    return WalletTransaction.create(data);
  }
}

export default WalletRepository;