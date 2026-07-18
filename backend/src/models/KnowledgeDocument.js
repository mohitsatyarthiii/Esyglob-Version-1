import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema({ question: String, answer: String }, { _id: false });

const knowledgeDocumentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  category: { type: String, required: true, index: true },
  subcategory: { type: String, default: '', index: true },
  summary: String,
  keywords: [String],
  synonyms: [String],
  exampleQuestions: [String],
  intentTags: [{ type: String, index: true }],
  targetRoles: [{ type: String, enum: ['buyer', 'seller', 'admin', 'general'], index: true }],
  supportedLanguages: [{ type: String, default: 'en' }],
  overview: String,
  steps: [String],
  businessRules: [String],
  importantNotes: [String],
  warnings: [String],
  tips: [String],
  faqs: [faqSchema],
  relatedFeatures: [String],
  relatedPolicies: [String],
  relatedHsCodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HSCode' }],
  relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  relatedServices: [String],
  relatedCountries: [String],
  searchTerms: [String],
  priority: { type: Number, default: 0, index: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now },
  searchableText: { type: String, default: '' },
  embedding: { type: [Number], select: false, default: undefined },
  embeddingModel: { type: String, select: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', select: false },
}, { timestamps: true });

knowledgeDocumentSchema.pre('validate', function deriveSearchText() {
  this.slug = String(this.slug || this.title || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  this.lastUpdated = new Date();
  this.searchableText = [this.title, this.summary, this.overview, this.category, this.subcategory,
    ...(this.keywords || []), ...(this.synonyms || []), ...(this.exampleQuestions || []),
    ...(this.intentTags || []), ...(this.searchTerms || []), ...(this.steps || [])]
    .filter(Boolean).join(' ').toLowerCase();
});

knowledgeDocumentSchema.index({ slug: 1, version: 1 }, { unique: true });
knowledgeDocumentSchema.index(
  { title: 'text', summary: 'text', overview: 'text', searchableText: 'text' },
  { weights: { title: 10, summary: 7, overview: 5, searchableText: 2 }, name: 'knowledge_retrieval_text' },
);
knowledgeDocumentSchema.index({ status: 1, targetRoles: 1, intentTags: 1, priority: -1 });

export default mongoose.models.KnowledgeDocument || mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
