import mongoose from 'mongoose';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import EscrowTransaction from '../models/EscrowTransaction.js';
import Seller from '../models/Seller.js';

const HOLDING_DAYS = 30;

export async function getOrCreateWallet({ userId, role, sellerId = null, currency = 'INR' }) {
  return Wallet.findOneAndUpdate(
    { userId, role },
    {
      $setOnInsert: { userId, role, sellerId, currency },
    },
    { upsert: true, new: true }
  );
}

export function getHoldUntil(fromDate = new Date()) {
  const holdUntil = new Date(fromDate);
  holdUntil.setDate(holdUntil.getDate() + HOLDING_DAYS);
  return holdUntil;
}

async function createTransactionOnce(filter, payload) {
  const existing = await WalletTransaction.findOne(filter);
  if (existing) return existing;
  return WalletTransaction.create(payload);
}

async function nextEscrowNumber() {
  const count = await EscrowTransaction.countDocuments();
  return `ESC${String(count + 1).padStart(8, '0')}`;
}

export async function recordOrderWalletEntries({ order, payment }) {
  if (!order || !payment) return null;

  const amount = Number(payment.amount || order.totalPrice || order.totalAmount || 0);
  if (!amount) return null;

  const buyerWallet = await getOrCreateWallet({
    userId: order.buyerId || order.userId,
    role: 'buyer',
    currency: order.currency || 'INR',
  });

  const seller = await Seller.findById(order.sellerId).lean();
  const sellerUserId = seller?.userId || order.sellerId;

  const sellerWallet = await getOrCreateWallet({
    userId: sellerUserId,
    role: 'seller',
    sellerId: order.sellerId,
    currency: order.currency || 'INR',
  });

  const type = order.orderType === 'sample' || order.orderSubType === 'sample_order' ? 'sample_order' : 'order';
  const holdUntil = getHoldUntil(order.deliveredAt || new Date());

  const escrow = await EscrowTransaction.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        transactionNumber: await nextEscrowNumber(),
        userId: order.buyerId || order.userId,
        sellerId: order.sellerId,
        orderId: order._id,
        amount,
        currency: order.currency || payment.currency || 'INR',
        status: 'funded',
        description: `Escrow for order ${order.orderNumber || order._id}`,
        fundedAt: new Date(),
        milestones: [{ title: 'Order settlement', percentage: 100, amount, status: 'funded' }],
      },
    },
    { upsert: true, new: true }
  );

  await createTransactionOnce(
    { paymentId: payment._id, userId: buyerWallet.userId, type, role: 'buyer' },
    {
      walletId: buyerWallet._id,
      userId: buyerWallet.userId,
      role: 'buyer',
      direction: 'debit',
      type,
      source: 'razorpay',
      amount,
      currency: order.currency || payment.currency || 'INR',
      status: 'completed',
      referenceModel: 'Order',
      referenceId: order._id,
      paymentId: payment._id,
      orderId: order._id,
      escrowId: escrow._id,
      description: `Payment for order ${order.orderNumber || order._id}`,
    }
  );

  await createTransactionOnce(
    { paymentId: payment._id, userId: sellerWallet.userId, type: 'escrow', role: 'seller' },
    {
      walletId: sellerWallet._id,
      userId: sellerWallet.userId,
      role: 'seller',
      direction: 'credit',
      type: 'escrow',
      source: 'order_payment',
      amount,
      currency: order.currency || payment.currency || 'INR',
      status: 'held',
      referenceModel: 'Order',
      referenceId: order._id,
      paymentId: payment._id,
      orderId: order._id,
      escrowId: escrow._id,
      holdUntil,
      description: `Held settlement for order ${order.orderNumber || order._id}`,
    }
  );

  await recalculateWallet(buyerWallet._id);
  await recalculateWallet(sellerWallet._id);
  return { buyerWallet, sellerWallet, escrow };
}

export async function recordSubscriptionWalletEntry({ user, payment, subscription }) {
  if (!user || !payment) return null;

  const wallet = await getOrCreateWallet({
    userId: user.id || user._id,
    role: user.roles?.includes('seller') && subscription?.userType === 'seller' ? 'seller' : 'buyer',
    currency: payment.currency || 'INR',
  });

  await createTransactionOnce(
    { paymentId: payment._id, userId: wallet.userId, type: 'subscription', role: wallet.role },
    {
      walletId: wallet._id,
      userId: wallet.userId,
      role: wallet.role,
      direction: 'debit',
      type: 'subscription',
      source: 'razorpay',
      amount: payment.amount || 0,
      currency: payment.currency || 'INR',
      status: 'completed',
      referenceModel: 'Subscription',
      referenceId: subscription?._id,
      paymentId: payment._id,
      description: 'Subscription payment',
      metadata: payment.metadata,
    }
  );

  await recalculateWallet(wallet._id);
  return wallet;
}

export async function recalculateWallet(walletId) {
  const wallet = await Wallet.findById(walletId);
  if (!wallet) return null;

  const now = new Date();

  // Release held transactions that have passed hold period
  await WalletTransaction.updateMany(
    { walletId: wallet._id, direction: 'credit', status: 'held', holdUntil: { $lte: now } },
    { $set: { status: 'released', releasedAt: now } }
  );

  const transactions = await WalletTransaction.find({ walletId: wallet._id }).lean();

  const completedCredits = transactions.filter(
    tx => tx.direction === 'credit' && ['completed', 'released'].includes(tx.status)
  );
  const completedDebits = transactions.filter(
    tx => tx.direction === 'debit' && tx.status === 'completed'
  );
  const heldCredits = transactions.filter(
    tx => tx.direction === 'credit' && tx.status === 'held'
  );

  wallet.totalCredits = completedCredits.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  wallet.totalDebits = completedDebits.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  wallet.escrowBalance = heldCredits.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  wallet.pendingSettlement = heldCredits.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  wallet.withdrawableAmount = Math.max(wallet.totalCredits - wallet.totalDebits, 0);
  wallet.balance = Math.max(wallet.totalCredits - wallet.totalDebits, 0);
  wallet.refundedAmount = transactions
    .filter(tx => tx.status === 'refunded')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  wallet.lastCalculatedAt = now;

  await wallet.save();
  return wallet;
}