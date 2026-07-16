import mongoose from 'mongoose';

const limitsSchema = new mongoose.Schema({ aiRequests: Number, rfqs: Number, quotations: Number, products: Number, messages: Number, serviceBookings: Number, marketInsights: Number, imageUploads: Number, documents: Number }, { _id: false });
const planSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  role: { type: String, enum: ['buyer', 'seller'], required: true, index: true },
  name: { type: String, required: true }, description: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  prices: { monthly: { type: Number, default: 0 }, quarterly: { type: Number, default: 0 }, yearly: { type: Number, default: 0 } },
  features: [String], aiCredits: { type: Number, default: 0 }, storageLimitMb: { type: Number, default: 100 }, limits: { type: limitsSchema, default: () => ({}) },
  supportLevel: { type: String, default: 'standard' }, priorityRanking: { type: Number, default: 0 }, verificationLevel: { type: String, default: 'basic' }, trustScoreBoost: { type: Number, default: 0 }, aiProvider: { type: String, enum: ['ollama', 'deepseek', 'openai', 'claude'], default: 'ollama' },
  aiTier: { type: String, enum: ['esyai_lite', 'esyai_pro', 'esyai_advanced', 'esyai_enterprise'], default: 'esyai_lite' },
  aiModel: { type: String, default: 'EsyAI Lite' },
  premiumBadge: { type: String, default: 'Essential' },
  recommended: { type: Boolean, default: false },
  popular: { type: Boolean, default: false },
  businessGrowthScore: { type: Number, min: 0, max: 100, default: 10 },
}, { timestamps: true });
export default mongoose.models.SubscriptionPlan || mongoose.model('SubscriptionPlan', planSchema);
