import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  couponCode: { type: String, required: true, uppercase: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
  currency: { type: String, required: true },
  orderAmount: { type: Number, required: true },
  discountAmount: { type: Number, required: true },
  status: { type: String, enum: ['reserved', 'redeemed', 'released'], default: 'reserved', index: true },
  redeemedAt: Date,
  releasedAt: Date,
}, { timestamps: true });

schema.index({ couponId: 1, orderId: 1 }, { unique: true, sparse: true });
schema.index({ couponId: 1, userId: 1, status: 1 });

export default mongoose.models.CouponRedemption || mongoose.model('CouponRedemption', schema);
