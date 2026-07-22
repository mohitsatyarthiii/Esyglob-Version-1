import mongoose from 'mongoose';
import { activitySchema, tradeDocumentSchema, tradeNoteSchema } from './schemas/tradeArtifact.schema.js';

const rfqSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      index: true,
    },
    sellerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      index: true,
    },
    rfqType: {
      type: String,
      enum: ['custom', 'product', 'multi_product'],
      default: 'custom',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 3000,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: '',
    },
    specifications: {
      type: String,
      maxlength: 3000,
      default: '',
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, trim: true },
        category: { type: String, trim: true },
        subcategory: { type: String, trim: true },
        quantity: { type: Number, min: 1 },
        unit: String,
        targetPrice: { type: Number, min: 0 },
        specifications: String,
        imageUrl: String,
      },
    ],
    
    // Order Details
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    minimumOrderQuantity: {
      type: Number,
      min: 1,
    },
    unit: {
      type: String,
      enum: ['pcs', 'kg', 'boxes', 'tons', 'liters', 'meters', 'rolls', 'sheets', 'other'],
      default: 'pcs',
    },
    targetPrice: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      enum: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CNY'],
      default: 'INR',
    },
    
    // Delivery Details
    deliveryCountry: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryPort: {
      type: String,
      trim: true,
    },
    deliveryTimeline: {
      type: String,
      enum: ['immediate', 'urgent', '1week', '2weeks', '1month', '2months', '3months', '30_days', '60_days', 'flexible'],
      default: 'flexible',
    },
    deliveryDate: Date,
    shippingPreference: { type: String, trim: true },
    drawings: [{ url: String, filename: String, uploadedAt: Date }],
    
    // Incoterms
    incoterms: {
      type: String,
      enum: ['FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP', 'FAS', 'CPT', 'CIP', 'other'],
      default: 'FOB',
    },
    
    // Attachments
    attachments: [
      {
        url: String,
        filename: String,
        type: {
          type: String,
          enum: ['image', 'document', 'other'],
          default: 'other',
        },
        uploadedAt: Date,
      },
    ],
    images: [
      {
        url: String,
        filename: String,
        uploadedAt: Date,
      },
    ],
    documents: [
      {
        url: String,
        filename: String,
        uploadedAt: Date,
      },
    ],
    
    // Status & Responses
    status: {
      type: String,
      enum: ['active', 'draft', 'submitted', 'pending', 'viewed', 'information_requested', 'seller_accepted', 'ready_for_quotation', 'replied', 'quoted', 'negotiating', 'archived', 'order_initiated', 'converted', 'closed', 'cancelled', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },
    acceptedQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
    },
    tradeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    quotationCount: {
      type: Number,
      default: 0,
    },
    lastQuotedAt: Date,
    closedAt: Date,
    expiresAt: Date,
    // RFQ Activity Tracking
    viewedBySellerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    repliedBySellerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    
    // Preferences
    preferredSuppliersCountries: [String],
    specificSupplierIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
      },
    ],
    isVerifiedSuppliersOnly: {
      type: Boolean,
      default: false,
    },
    
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    notes: { type: [tradeNoteSchema], default: [] },
    tradeDocuments: { type: [tradeDocumentSchema], default: [] },
    activityTimeline: { type: [activitySchema], default: [] },
    previousStatus: String,
    revisionHistory: [{ version: Number, revisedAt: { type: Date, default: Date.now }, revisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, changedFields: [String], notes: String, documents: [mongoose.Schema.Types.Mixed], snapshot: mongoose.Schema.Types.Mixed }],
    approvalHistory: [{ action: String, previousStatus: String, newStatus: String, actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorRole: String, notes: String, createdAt: { type: Date, default: Date.now } }],
  },
  {
    timestamps: true,
    indexes: [
      { status: 1, createdAt: -1 },
      { buyerId: 1, status: 1 },
      { visibility: 1, status: 1, createdAt: -1 },
      { category: 1, status: 1 },
      { buyerId: 1, visibility: 1, createdAt: -1 },
      { sellerUserId: 1, status: 1, createdAt: -1 },
      { conversationId: 1 },
      { category: 1, subcategory: 1, status: 1, createdAt: -1 },
      { deliveryCountry: 1 },
    ],
  }
);

rfqSchema.index({
  title: 'text',
  description: 'text',
  category: 'text',
  subcategory: 'text',
  deliveryCountry: 'text',
  specifications: 'text',
});

export default mongoose.models.RFQ || mongoose.model('RFQ', rfqSchema);
