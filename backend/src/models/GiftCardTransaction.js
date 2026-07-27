import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  giftCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'GiftCard', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  type: { type: String, enum: ['issue', 'reserve', 'redeem', 'release', 'adjustment'], required: true },
  amount: { type: Number, required: true, min: 0 },
  balanceAfter: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  status: { type: String, enum: ['completed', 'reserved', 'released'], default: 'completed' },
  note: { type: String, trim: true, default: '' },
}, { timestamps: true });

schema.index({ giftCardId: 1, orderId: 1, type: 1 }, { unique: true, sparse: true });

export default mongoose.models.GiftCardTransaction || mongoose.model('GiftCardTransaction', schema);
