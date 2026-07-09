// models/MarketAnalytics.js
import mongoose from 'mongoose';

const marketAnalyticsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Report Details
  reportName: String,
  reportType: {
    type: String,
    enum: ['market_overview', 'competitor_analysis', 'price_trend', 'demand_forecast', 'export_opportunity', 'custom'],
    required: true
  },
  
  // Parameters
  parameters: {
    productCategories: [String],
    hsCodes: [String],
    countries: [String],
    dateRange: {
      start: Date,
      end: Date
    },
    metrics: [String]
  },
  
  // Report Data
  data: {
    summary: String,
    charts: [{
      type: String,
      title: String,
      data: mongoose.Schema.Types.Mixed,
      insights: String
    }],
    tables: [{
      title: String,
      headers: [String],
      rows: [mongoose.Schema.Types.Mixed]
    }],
    insights: [{
      category: String,
      finding: String,
      impact: { type: String, enum: ['high', 'medium', 'low'] },
      recommendation: String
    }]
  },
  
  // Export
  exportFormats: [{
    type: String,
    enum: ['pdf', 'excel', 'csv', 'json']
  }],
  reportUrl: String,
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'generating', 'completed', 'failed'],
    default: 'draft'
  },
  
  // Alerts
  alerts: [{
    type: { type: String, enum: ['price_change', 'demand_surge', 'new_competitor', 'tariff_change', 'opportunity'] },
    threshold: mongoose.Schema.Types.Mixed,
    frequency: { type: String, enum: ['instant', 'daily', 'weekly'] },
    active: { type: Boolean, default: true }
  }],
  
  // Subscription
  subscription: {
    plan: { type: String, enum: ['free', 'basic', 'professional', 'enterprise'], default: 'free' },
    startDate: Date,
    endDate: Date,
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

marketAnalyticsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.MarketAnalytics || mongoose.model('MarketAnalytics', marketAnalyticsSchema);