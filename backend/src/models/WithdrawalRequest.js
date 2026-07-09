import mongoose from 'mongoose';
import crypto from 'crypto';

const withdrawalRequestSchema = new mongoose.Schema(
  {
    withdrawalNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
      index: true,
    },
    requestedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    paidAt: Date,
    rejectionReason: String,
    adminNotes: String,
  },
  { timestamps: true }
);

withdrawalRequestSchema.index({ userId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ sellerId: 1, createdAt: -1 });

withdrawalRequestSchema.pre('validate', async function setWithdrawalNumber(next) {
  if (this.withdrawalNumber) return next();
  this.withdrawalNumber = `WDR${Date.now().toString(36).toUpperCase()}${crypto.randomInt(1000, 10000)}`;
  next();
});

export default mongoose.models.WithdrawalRequest ||
  mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
