import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: { type: String, required: true, unique: true, index: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['buyer', 'seller', 'admin'], required: true, index: true },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    type: {
      type: String,
      enum: ['order', 'sample_order', 'subscription', 'escrow', 'withdrawal', 'refund', 'adjustment', 'wallet_credit', 'wallet_debit'],
      required: true,
      index: true,
    },
    source: { type: String, default: '' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'held', 'released', 'cancelled'],
      default: 'pending',
      index: true,
    },
    referenceModel: String,
    referenceId: mongoose.Schema.Types.ObjectId,
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    escrowId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowTransaction' },
    withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'WithdrawalRequest' },
    holdUntil: Date,
    releasedAt: Date,
    description: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ referenceModel: 1, referenceId: 1, type: 1, role: 1 });
walletTransactionSchema.index({ holdUntil: 1, status: 1 });

walletTransactionSchema.pre('validate', async function setTransactionNumber(next) {
  if (this.transactionNumber) return next();
  const count = await mongoose.model('WalletTransaction').countDocuments();
  this.transactionNumber = `WTX${String(count + 1).padStart(9, '0')}`;
  next();
});

export default mongoose.models.WalletTransaction ||
  mongoose.model('WalletTransaction', walletTransactionSchema);
