// src/models/knowledgeDocument.js

import mongoose from 'mongoose';

const faqSchema = new mongoose.Schema({ 
  question: String, 
  answer: String 
}, { _id: false });

const knowledgeDocumentSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true 
  },
  slug: { 
    type: String, 
    required: true, 
    trim: true, 
    lowercase: true 
  },
  subcategory: { 
    type: String, 
    default: '', 
    index: true 
  },
  content: {
    type: String,
    required: true,
    default: ''
  },
  summary: {
    type: String,
    default: ''
  },
  overview: {
    type: String,
    default: ''
  },
  keywords: {
    type: [String],
    default: []
  },
  synonyms: {
    type: [String],
    default: []
  },
  exampleQuestions: {
    type: [String],
    default: []
  },
  intentTags: {
    type: [String],
    index: true,
    default: []
  },
  targetRoles: {
    type: [String],
    enum: ['All Users', 'Buyers', 'Suppliers', 'Manufacturers', 'Sellers', 'Developers', 'Technical Users', 'Admin'],
    index: true,
    default: ['All Users']
  },
  supportedLanguages: {
    type: [String],
    default: ['en']
  },
  steps: {
    type: [String],
    default: []
  },
  businessRules: {
    type: [String],
    default: []
  },
  importantNotes: {
    type: [String],
    default: []
  },
  warnings: {
    type: [String],
    default: []
  },
  tips: {
    type: [String],
    default: []
  },
  faqs: {
    type: [faqSchema],
    default: []
  },
  relatedFeatures: {
    type: [String],
    default: []
  },
  relatedPolicies: {
    type: [String],
    default: []
  },
  relatedHsCodes: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'HSCode',
    default: []
  },
  relatedProducts: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Product',
    default: []
  },
  relatedServices: {
    type: [String],
    default: []
  },
  relatedCountries: {
    type: [String],
    default: []
  },
  searchTerms: {
    type: [String],
    default: []
  },
  priority: {
    type: Number,
    default: 0,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true
  },
  version: {
    type: Number,
    default: 1
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  searchableText: {
    type: String,
    default: ''
  },
  embedding: {
    type: [Number],
    select: false,
    default: undefined
  },
  embeddingModel: {
    type: String,
    select: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    select: false
  }
}, { 
  timestamps: true 
});

// Pre-save middleware
knowledgeDocumentSchema.pre('validate', function deriveSearchText() {
  if (!this.slug && this.title) {
    this.slug = String(this.title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  
  this.lastUpdated = new Date();
  
  this.searchableText = [
    this.title,
    this.summary,
    this.overview,
    this.content,
    this.subcategory,
    ...(this.keywords || []),
    ...(this.synonyms || []),
    ...(this.exampleQuestions || []),
    ...(this.intentTags || []),
    ...(this.searchTerms || []),
    ...(this.steps || [])
  ]
  .filter(Boolean)
  .join(' ')
  .toLowerCase();
});

// Indexes
knowledgeDocumentSchema.index({ slug: 1, version: 1 }, { unique: true });
knowledgeDocumentSchema.index(
  { 
    title: 'text', 
    summary: 'text', 
    overview: 'text', 
    content: 'text',
    searchableText: 'text' 
  },
  { 
    weights: { 
      title: 10, 
      summary: 7, 
      overview: 5, 
      content: 5,
      searchableText: 2 
    }, 
    name: 'knowledge_retrieval_text' 
  }
);

// FIXED: Remove the compound index with multiple arrays
// Use separate indexes instead
knowledgeDocumentSchema.index({ status: 1 });
knowledgeDocumentSchema.index({ targetRoles: 1 });
knowledgeDocumentSchema.index({ intentTags: 1 });
knowledgeDocumentSchema.index({ priority: -1 });

const KnowledgeDocument = mongoose.models.KnowledgeDocument || mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);

export default KnowledgeDocument;