import mongoose from 'mongoose';
import { getAIKnowledgeConnection } from '../config/knowledge-database.js';

const tradeKnowledgeSchema = new mongoose.Schema({
  queryKey: { type: String, required: true, unique: true, index: true },
  canonicalQuery: { type: String, required: true },
  product: { type: String, required: true, index: true },
  category: { type: String, default: '', index: true },
  countries: { type: [String], default: [], index: true },
  hsCodes: { type: [String], default: [], index: true },
  intents: { type: [String], default: [], index: true },
  structuredIntent: { type: mongoose.Schema.Types.Mixed, required: true },
  dataset: { type: mongoose.Schema.Types.Mixed, required: true },
  sources: { type: [mongoose.Schema.Types.Mixed], default: [] },
  relatedProducts: { type: [String], default: [] },
  dataVersion: { type: String, required: true, index: true },
  collectedAt: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  backgroundEnrichedAt: Date,
  quality: {
    officialSourceCount: { type: Number, default: 0 },
    observationCount: { type: Number, default: 0 },
    completeness: { type: Number, default: 0 },
    sourceQualityScore: { type: Number, default: 0 },
    latestPeriod: Number,
  },
  status: { type: String, enum: ['active', 'stale', 'invalid'], default: 'active', index: true },
}, { timestamps: true, minimize: false });

tradeKnowledgeSchema.index({ product: 1, countries: 1, status: 1, expiresAt: -1 });
tradeKnowledgeSchema.index({ status: 1, expiresAt: 1 });

export function getTradeKnowledgeModel() {
  const connection = getAIKnowledgeConnection();
  return connection.models.TradeKnowledge || connection.model('TradeKnowledge', tradeKnowledgeSchema);
}
