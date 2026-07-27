import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true, select: false },
  codeLast4: { type: String, required: true, index: true },
  label: { type: String, trim: true, default: 'EsyGlob Gift Card' },
  kind: { type: String, enum: ['fixed', 'custom', 'promotional', 'admin_generated', 'purchased'], default: 'fixed' },
  originalBalance: { type: Number, required: true, min: 0 },
  balance: { type: Number, required: true, min: 0 },
  currency: { type: String, uppercase: true, required: true, default: 'INR' },
  purchaserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  recipientEmail: { type: String, lowercase: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['active', 'inactive', 'depleted', 'expired', 'cancelled'], default: 'active', index: true },
  activatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  purchaseStatus: { type: String, enum: ['not_required', 'pending', 'paid', 'failed'], default: 'not_required', index: true },
  gatewayOrderId: { type: String, select: false, index: true },
  gatewayPaymentId: { type: String, select: false },
}, { timestamps: true });

schema.index({ ownerId: 1, status: 1, createdAt: -1 });

export default mongoose.models.GiftCard || mongoose.model('GiftCard', schema);
