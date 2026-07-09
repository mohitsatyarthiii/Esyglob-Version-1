import WalletRepository from '../repositories/wallet.repository.js';
import { recalculateWallet } from '../lib/wallet-ledger.js';
import {
  encryptPaymentValue,
  maskAccountNumber,
  validateIfsc,
  validateUpi,
} from '../lib/secure-payment-data.js';
import mongoose from 'mongoose';

function chooseRole(user, requestedRole) {
  if (requestedRole && user.roles?.includes(requestedRole)) return requestedRole;
  if (user.primaryRole && user.roles?.includes(user.primaryRole)) return user.primaryRole;
  return user.roles?.includes('seller') ? 'seller' : 'buyer';
}

function sum(items, field = 'amount') {
  return items.reduce((total, item) => total + Number(item[field] || 0), 0);
}

class WalletService {
  /**
   * Get wallet summary/dashboard
   */
  static async getWalletSummary(user, roleParam) {
    const role = chooseRole(user, roleParam);
    const seller = role === 'seller' ? await WalletRepository.findSellerByUserId(user.id || user._id) : null;

    if (role === 'seller' && !seller) {
      throw Object.assign(new Error('Seller account not found'), { statusCode: 404 });
    }

    const userId = user.id || user._id;
    const wallet = await WalletRepository.getOrCreateWallet({
      userId,
      role,
      sellerId: seller?._id || null,
      currency: 'INR',
    });

    const recalculatedWallet = await recalculateWallet(wallet._id);

    const [
      transactions,
      paymentMethods,
      withdrawals,
      payments,
      orders,
    ] = await Promise.all([
      WalletRepository.getTransactions(wallet._id),
      WalletRepository.getPaymentMethods(userId, role),
      WalletRepository.getWithdrawals(userId, wallet._id),
      WalletRepository.getPayments(userId),
      role === 'seller'
        ? WalletRepository.getOrders({ sellerId: seller?._id })
        : WalletRepository.getOrders({ buyerId: userId }),
    ]);

    // Escrow transactions
    const escrowTransactions = role === 'seller'
      ? await WalletRepository.getEscrowTransactions({ sellerId: seller?._id })
      : await WalletRepository.getEscrowTransactions({ userId });

    // Calculate summary
    const pendingWithdrawalAmount = sum(
      withdrawals.filter(w => ['pending', 'approved'].includes(w.status))
    );

    const completedPayments = payments.filter(p => p.status === 'completed');
    const orderPayments = completedPayments.filter(p => p.paymentFor === 'order');
    const subscriptionPayments = completedPayments.filter(p => p.paymentFor === 'subscription');
    const sampleOrderPayments = orderPayments.filter(p =>
      orders.some(o => String(o._id) === String(p.orderId) && o.orderType === 'sample')
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const week = new Date(now);
    week.setDate(now.getDate() - 7);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const releasedSellerCredits = transactions.filter(
      tx => tx.role === 'seller' && tx.direction === 'credit' && ['completed', 'released'].includes(tx.status)
    );

    return {
      wallet: recalculatedWallet || wallet,
      role,
      summary: {
        balance: recalculatedWallet?.balance || 0,
        escrowBalance: recalculatedWallet?.escrowBalance || 0,
        pendingSettlement: recalculatedWallet?.pendingSettlement || 0,
        withdrawableAmount: Math.max((recalculatedWallet?.withdrawableAmount || 0) - pendingWithdrawalAmount, 0),
        pendingWithdrawalAmount,
        refundedAmount: recalculatedWallet?.refundedAmount || 0,
        totalCredits: recalculatedWallet?.totalCredits || 0,
        totalDebits: recalculatedWallet?.totalDebits || 0,
        completedPayments: completedPayments.length,
        orderPaymentTotal: sum(orderPayments),
        subscriptionPaymentTotal: sum(subscriptionPayments),
        sampleOrderPaymentTotal: sum(sampleOrderPayments),
        sellerEarnings: {
          today: sum(releasedSellerCredits.filter(tx => new Date(tx.createdAt) >= today)),
          week: sum(releasedSellerCredits.filter(tx => new Date(tx.createdAt) >= week)),
          month: sum(releasedSellerCredits.filter(tx => new Date(tx.createdAt) >= month)),
          total: sum(releasedSellerCredits),
        },
      },
      transactions,
      paymentMethods,
      withdrawals,
      escrowTransactions,
      payments,
      orders,
    };
  }

  /**
   * Get withdrawal history
   */
  static async getWithdrawals(user) {
    if (!user.roles?.includes('seller')) {
      throw Object.assign(new Error('Seller access required'), { statusCode: 403 });
    }

    const userId = user.id || user._id;
    const seller = await WalletRepository.findSellerByUserId(userId);
    const wallet = await WalletRepository.getOrCreateWallet({
      userId,
      role: 'seller',
      sellerId: seller?._id || null,
    });

    const WithdrawalRequest = (await import('../models/WithdrawalRequest.js')).default;
    const withdrawals = await WithdrawalRequest.find({ userId, walletId: wallet._id })
      .populate('paymentMethodId', 'type label maskedAccountNumber upiId bankName verificationStatus')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return { withdrawals };
  }

  /**
   * Create withdrawal request
   */
  static async createWithdrawal(user, body) {
    if (!user.roles?.includes('seller')) {
      throw Object.assign(new Error('Seller access required'), { statusCode: 403 });
    }

    const amount = Number(body.amount || 0);
    if (!Number.isFinite(amount) || amount < 100) {
      throw Object.assign(new Error('Minimum withdrawal amount is INR 100'), { statusCode: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(body.paymentMethodId)) {
      throw Object.assign(new Error('Select a verified bank account or UPI method'), { statusCode: 400 });
    }

    const userId = user.id || user._id;
    const seller = await WalletRepository.findSellerByUserId(userId);
    if (!seller) {
      throw Object.assign(new Error('Seller account not found'), { statusCode: 404 });
    }

    const wallet = await WalletRepository.getOrCreateWallet({
      userId,
      role: 'seller',
      sellerId: seller._id,
      currency: body.currency || 'INR',
    });

    const recalculatedWallet = await recalculateWallet(wallet._id);

    // Verify payment method
    const method = await WalletRepository.findPaymentMethod(body.paymentMethodId, userId, 'seller');
    if (!method) {
      throw Object.assign(new Error('Select a verified bank account or UPI method'), { statusCode: 400 });
    }

    // Check available balance
    const pendingWithdrawalAmount = await WalletRepository.getPendingWithdrawalAmount(userId, wallet._id);
    const available = Math.max((recalculatedWallet?.withdrawableAmount || 0) - pendingWithdrawalAmount, 0);

    if (amount > available) {
      throw Object.assign(new Error('Withdrawal amount exceeds available balance'), { statusCode: 400 });
    }

    // Create withdrawal
    const withdrawal = await WalletRepository.createWithdrawal({
      userId,
      sellerId: seller._id,
      walletId: wallet._id,
      paymentMethodId: method._id,
      amount,
      currency: body.currency || recalculatedWallet?.currency || 'INR',
      status: 'pending',
    });

    // Create wallet transaction
    await WalletRepository.createTransaction({
      walletId: wallet._id,
      userId,
      role: 'seller',
      direction: 'debit',
      type: 'withdrawal',
      source: 'seller_wallet',
      amount,
      currency: withdrawal.currency,
      status: 'pending',
      withdrawalId: withdrawal._id,
      referenceModel: 'WithdrawalRequest',
      referenceId: withdrawal._id,
      description: `Withdrawal request ${withdrawal.withdrawalNumber}`,
    });

    return { success: true, withdrawal };
  }

  /**
   * Get payment methods
   */
  static async getPaymentMethods(user, roleParam) {
    const userId = user.id || user._id;
    const role = chooseRole(user, roleParam);
    const methods = await WalletRepository.getPaymentMethods(userId, role);
    return { methods };
  }

  /**
   * Add payment method
   */
  static async addPaymentMethod(user, body) {
    const userId = user.id || user._id;
    const role = chooseRole(user, body.role);
    const type = body.type;

    if (!['bank_account', 'upi', 'card'].includes(type)) {
      throw Object.assign(new Error('Unsupported payment method type'), { statusCode: 400 });
    }

    const payload = {
      userId,
      role,
      type,
      label: body.label || '',
      isDefault: Boolean(body.isDefault),
    };

    // Bank account
    if (type === 'bank_account') {
      const accountNumber = String(body.accountNumber || '').replace(/\D/g, '');
      const ifsc = String(body.ifsc || '').trim().toUpperCase();
      const holderName = String(body.holderName || '').trim();

      if (!holderName || accountNumber.length < 9 || accountNumber.length > 18 || !validateIfsc(ifsc)) {
        throw Object.assign(new Error('Enter a valid bank holder name, account number and IFSC'), { statusCode: 400 });
      }

      Object.assign(payload, {
        holderName,
        bankName: String(body.bankName || '').trim(),
        ifsc,
        maskedAccountNumber: maskAccountNumber(accountNumber),
        encryptedAccountNumber: encryptPaymentValue(accountNumber),
        verificationStatus: 'verified',
        verificationMessage: 'Format verified',
      });
    }

    // UPI
    if (type === 'upi') {
      const upiId = String(body.upiId || '').trim();
      if (!validateUpi(upiId)) {
        throw Object.assign(new Error('Enter a valid UPI ID'), { statusCode: 400 });
      }

      Object.assign(payload, {
        upiId,
        verificationStatus: 'verified',
        verificationMessage: 'Format verified',
      });
    }

    // Card
    if (type === 'card') {
      const last4 = String(body.cardLast4 || '').trim();
      if (!/^\d{4}$/.test(last4) || !body.providerToken) {
        throw Object.assign(new Error('Cards must be tokenized by the payment provider before saving'), { statusCode: 400 });
      }

      Object.assign(payload, {
        holderName: String(body.holderName || '').trim(),
        cardBrand: String(body.cardBrand || '').trim(),
        cardLast4: last4,
        cardExpiryMonth: String(body.cardExpiryMonth || '').trim(),
        cardExpiryYear: String(body.cardExpiryYear || '').trim(),
        providerToken: body.providerToken,
        verificationStatus: 'verified',
        verificationMessage: 'Tokenized card saved',
      });
    }

    // Handle default
    if (payload.isDefault) {
      await WalletRepository.unsetDefaultPaymentMethods(userId, role);
    }

    const method = await WalletRepository.createPaymentMethod(payload);
    return { success: true, method };
  }
}

export default WalletService;
