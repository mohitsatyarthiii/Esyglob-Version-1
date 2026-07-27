import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  ownerType: { type: String, enum: ['platform', 'seller'], required: true, index: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  discountType: {
    type: String,
    enum: ['percentage', 'fixed_amount', 'free_shipping'],
    required: true,
  },
  value: { type: Number, min: 0, required: true },
  maximumDiscount: { type: Number, min: 0, default: null },
  minimumOrderValue: { type: Number, min: 0, default: 0 },
  currency: { type: String, uppercase: true, trim: true, default: 'INR' },
  scope: {
    type: String,
    enum: ['platform', 'product', 'category', 'seller', 'manufacturer', 'subscription'],
    default: 'platform',
  },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  sellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }],
  manufacturerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }],
  countryCodes: [{ type: String, uppercase: true, trim: true }],
  currencyCodes: [{ type: String, uppercase: true, trim: true }],
  firstOrderOnly: { type: Boolean, default: false },
  referralOnly: { type: Boolean, default: false },
  campaignType: {
    type: String,
    enum: ['standard', 'limited_time', 'festival', 'referral', 'first_order', 'subscription'],
    default: 'standard',
  },
  startsAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, default: null, index: true },
  usageLimit: { type: Number, min: 1, default: null },
  perUserUsageLimit: { type: Number, min: 1, default: 1 },
  priority: { type: Number, default: 0, index: true },
  stackable: { type: Boolean, default: false },
  stackGroup: { type: String, trim: true, default: 'default' },
  status: { type: String, enum: ['draft', 'active', 'inactive', 'expired'], default: 'draft', index: true },
  redemptionCount: { type: Number, min: 0, default: 0 },
  totalDiscountDistributed: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

couponSchema.index({ ownerType: 1, sellerId: 1, status: 1, startsAt: 1, expiresAt: 1 });
couponSchema.index({ productIds: 1, status: 1 });
couponSchema.index({ categoryIds: 1, status: 1 });

couponSchema.pre('validate', function normalizeCoupon() {
  this.code = String(this.code || '').trim().toUpperCase();
  if (this.ownerType === 'seller' && !this.sellerId) this.invalidate('sellerId', 'Seller coupon requires a seller');
  if (this.discountType === 'percentage' && this.value > 100) this.invalidate('value', 'Percentage cannot exceed 100');
  if (this.expiresAt && this.startsAt && this.expiresAt <= this.startsAt) this.invalidate('expiresAt', 'Expiry must be after activation');
  const requiredScopeList = {
    product: this.productIds,
    category: this.categoryIds,
    seller: this.ownerType === 'seller' ? [this.sellerId] : this.sellerIds,
    manufacturer: this.manufacturerIds,
  };
  if (requiredScopeList[this.scope] && !requiredScopeList[this.scope].filter(Boolean).length) {
    this.invalidate('scope', `${this.scope} scope requires at least one restriction`);
  }
});

export default mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
