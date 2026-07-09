import mongoose from 'mongoose';

const tradeAssuranceCaseSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: String,
    providerReference: String,
    protectedAmount: Number,
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['draft', 'awaiting_funds', 'funded', 'seller_released', 'buyer_released', 'disputed', 'refunded', 'closed'],
      default: 'draft',
      index: true,
    },
    buyerProtectionTerms: [String],
    sellerProtectionTerms: [String],
    fundedAt: Date,
    releasedAt: Date,
    providerPayload: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

export default mongoose.models.TradeAssuranceCase ||
  mongoose.model('TradeAssuranceCase', tradeAssuranceCaseSchema);
