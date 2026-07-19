// models/SubscriptionPlan.js
import mongoose from 'mongoose';

const priceSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  symbol: { type: String, default: '₹' },
  savingsPercent: { type: Number, default: 0 }
}, { _id: false });

const pricesSchema = new mongoose.Schema({
  monthly: { type: priceSchema, required: true },
  quarterly: { type: priceSchema, required: true },
  yearly: { type: priceSchema, required: true }
}, { _id: false });

const aiCreditsSchema = new mongoose.Schema({
  monthly: { type: Number, required: true },
  rollover: { type: Boolean, default: false },
  maxRollover: { type: Number, default: 0 },
  bonusOnUpgrade: { type: Number, default: 0 }
}, { _id: false });

const supportSchema = new mongoose.Schema({
  level: { 
    type: String, 
    enum: ['standard', 'priority', 'priority_plus', 'dedicated'],
    required: true 
  },
  responseTime: { type: String, required: true },
  channels: [{ type: String }]
}, { _id: false });

const brandingSchema = new mongoose.Schema({
  badge: { type: String, default: null },
  color: { type: String, default: '#6B7280' },
  icon: { type: String, default: null }
}, { _id: false });

const featuresSchema = new mongoose.Schema({
  core: [{ type: String }],
  ai: [{ type: String }],
  highlighted: [{ type: String }]
}, { _id: false });

const restrictionsSchema = new mongoose.Schema({
  rfqsPerMonth: { type: Number, default: 10 },
  quotationsPerMonth: { type: Number, default: 20 },
  maxActiveMessages: { type: Number, default: 50 },
  maxServiceBookings: { type: Number, default: 5 },
  maxMarketInsights: { type: Number, default: 10 },
  maxImageUploads: { type: Number, default: 25 },
  maxDocuments: { type: Number, default: 50 },
  maxSavedProducts: { type: Number, default: 100 },
  maxSavedSellers: { type: Number, default: 50 },
  maxWishlistItems: { type: Number, default: 50 },
  maxProducts: { type: Number, default: 0 },
  teamMembers: { type: Number, default: 1 }
}, { _id: false });

const subscriptionPlanSchema = new mongoose.Schema({
  // Basic Info
  key: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  role: { 
    type: String, 
    enum: ['buyer', 'seller'], 
    required: true,
    index: true 
  },
  tier: { 
    type: String, 
    enum: ['starter', 'growth', 'verified', 'business', 'gold', 'enterprise'],
    required: true 
  },
  
  // Display Info
  name: { type: String, required: true },
  subtitle: { type: String, default: '' },
  description: { type: String, required: true },
  
  // Pricing
  prices: { type: pricesSchema, required: true },
  
  // Resources
  aiCredits: { type: aiCreditsSchema, required: true },
  storageLimitMb: { type: Number, required: true },
  
  // Support
  support: { type: supportSchema, required: true },
  
  // Trust & Verification
  trustScoreBoost: { type: Number, default: 0 },
  verificationLevel: { 
    type: String, 
    enum: ['basic', 'business', 'business_verified', 'factory_verified', 'enterprise_verified', 'diamond_verified'],
    default: 'basic' 
  },
  aiTier: { 
    type: String, 
    enum: ['esyai_lite', 'esyai_pro', 'esyai_advanced', 'esyai_enterprise'],
    required: true 
  },
  
  // Ranking
  priorityRanking: { type: Number, default: 0 },
  
  // Branding
  branding: { type: brandingSchema, default: {} },
  
  // Features
  features: { type: featuresSchema, required: true },
  
  // Restrictions
  restrictions: { type: restrictionsSchema, required: true },
  
  // Status & Display
  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  
  // Metadata
  metadata: {
    version: { type: String, default: '2.0' },
    lastUpdated: { type: Date, default: Date.now },
    region: { type: String, default: 'india' }
  }
}, {
  timestamps: true,
  collection: 'subscriptionplans'
});

// Indexes for faster queries
subscriptionPlanSchema.index({ role: 1, tier: 1 });
subscriptionPlanSchema.index({ key: 1, isActive: 1 });

// Pre-save middleware
subscriptionPlanSchema.pre('save', function(next) {
  this.metadata.lastUpdated = new Date();
  next();
});

// Static method to get active plans by role
subscriptionPlanSchema.statics.getActivePlans = function(role) {
  return this.find({ role, isActive: true })
    .sort({ priorityRanking: 1 })
    .lean();
};

// Static method to get plan by key
subscriptionPlanSchema.statics.getByKey = function(key) {
  return this.findOne({ key, isActive: true }).lean();
};

// Instance method to check if plan has unlimited access
subscriptionPlanSchema.methods.isUnlimited = function(feature) {
  return this.restrictions[feature] === -1;
};

// Instance method to format prices for display
subscriptionPlanSchema.methods.getFormattedPrices = function() {
  const formatPrice = (price) => {
    if (!price || price.amount === 0) return 'Free';
    return `${price.symbol}${price.amount.toLocaleString('en-IN')}`;
  };

  return {
    monthly: formatPrice(this.prices.monthly),
    quarterly: formatPrice(this.prices.quarterly),
    yearly: formatPrice(this.prices.yearly),
    bestValue: this.prices.yearly.savingsPercent > 0 ? 'yearly' : 'monthly'
  };
};

// Instance method to get yearly savings
subscriptionPlanSchema.methods.getYearlySavings = function() {
  if (!this.prices.monthly.amount) return 0;
  const monthlyTotal = this.prices.monthly.amount * 12;
  const yearlyTotal = this.prices.yearly.amount;
  return monthlyTotal - yearlyTotal;
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;