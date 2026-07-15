import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    userType: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true,
    },

    // BUYER PLANS
    buyerPlan: {
      type: String,
      default: 'free',
    },

    buyerDuration: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', '3years'],
      default: null,
    },

    // SELLER PLANS
    sellerPlan: {
      type: String,
      default: 'free',
    },

    isVerifiedSupplier: {
      type: Boolean,
      default: false,
    },

    verificationExpiresAt: {
      type: Date,
      default: null,
    },

    sellerDuration: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', '3years'],
      default: null,
    },

    // SUBSCRIPTION DETAILS
    startDate: {
      type: Date,
      default: Date.now,
    },

    renewalDate: {
      type: Date,
      default: null,
    },

    expiryDate: {
      type: Date,
      default: null,
    },

    autoRenew: {
      type: Boolean,
      default: true,
    },

    isActive: {
      type: Boolean,
      default: false,
    },

    amountPaid: {
      type: Number,
      default: 0,
    },

    billingCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', '3years'],
      default: null,
    },

    lastPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },

    paymentHistoryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment',
      },
    ],
    status: { type: String, enum: ['active', 'expiring_soon', 'expired', 'cancelled', 'pending', 'payment_failed', 'grace_period'], default: 'active', index: true },
    planKey: String,
    aiCreditsAllocated: { type: Number, default: 0 }, aiCreditsUsed: { type: Number, default: 0 }, creditsResetAt: Date,
    usage: { type: mongoose.Schema.Types.Mixed, default: {} }, usageResetAt: Date,
    gracePeriodEndsAt: Date,
  },
  {
    timestamps: true,
    indexes: [
      { userId: 1 },
      { userType: 1, isActive: 1 },
      { expiryDate: 1 },
    ],
  }
);

subscriptionSchema.index({
  userType: 'text',
  buyerPlan: 'text',
  sellerPlan: 'text',
  buyerDuration: 'text',
  sellerDuration: 'text',
  billingCycle: 'text',
});

export default mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
