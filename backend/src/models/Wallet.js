import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['buyer', 'seller', 'admin'], required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    currency: { type: String, default: 'INR' },
    balance: { type: Number, default: 0 },
    escrowBalance: { type: Number, default: 0 },
    pendingSettlement: { type: Number, default: 0 },
    withdrawableAmount: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    totalCredits: { type: Number, default: 0 },
    totalDebits: { type: Number, default: 0 },
    lastCalculatedAt: Date,
  },
  { timestamps: true }
);

walletSchema.index({ userId: 1, role: 1 }, { unique: true });
walletSchema.index({ role: 1, updatedAt: -1 });

export default mongoose.models.Wallet || mongoose.model('Wallet', walletSchema);
