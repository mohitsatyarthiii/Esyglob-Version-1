import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    
    // Usage Tracking
    feature: {
      type: String,
      enum: ['search', 'chat', 'supplier_finder', 'product_discovery', 'market_trends', 'rfq_generator', 'description_improver', 'lead_recommendations'],
      required: true,
    },
    modelUsed: {
      type: String,
      default: 'mistral',
    },
    
    // Request Details
    requestTokens: {
      type: Number,
      default: 0,
    },
    responseTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    
    // Cost & Quotas
    costEstimate: {
      type: Number,
      default: 0,
    },
    
    // Counters (reset monthly)
    monthlySearchCount: {
      type: Number,
      default: 0,
    },
    monthlyChatCount: {
      type: Number,
      default: 0,
    },
    monthlyTokensUsed: {
      type: Number,
      default: 0,
    },
    monthResetDate: {
      type: Date,
    },
    
    // Status
    status: {
      type: String,
      enum: ['success', 'failed', 'rate_limited'],
      default: 'success',
    },
    errorMessage: String,
    
    // Response Quality
    responseTime: {
      type: Number, // milliseconds
      default: 0,
    },
  },
  {
    timestamps: true,
    indexes: [
      { userId: 1, createdAt: -1 },
      { userId: 1, feature: 1, createdAt: -1 },
      { subscriptionId: 1 },
      { monthlySearchCount: 1 },
    ],
  }
);

export default mongoose.models.AIUsage || mongoose.model('AIUsage', aiUsageSchema);
