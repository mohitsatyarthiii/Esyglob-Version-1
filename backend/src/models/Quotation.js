import mongoose from 'mongoose';
import { activitySchema, tradeDocumentSchema, tradeNoteSchema } from './schemas/tradeArtifact.schema.js';

const quotationSchema = new mongoose.Schema(
  {
    rfqId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RFQ',
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
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    // Pricing
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrice: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    pricingTiers: [
      {
        minQuantity: { type: Number, min: 1 },
        maxQuantity: { type: Number, min: 1 },
        unitPrice: { type: Number, min: 0 },
        notes: String,
      },
    ],
    
    // Order Details
    minimumOrderQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    suppliedQuantity: {
      type: Number,
    },
    
    // Lead Time
    leadTime: {
      type: Number, // in days
      required: true,
      min: 1,
    },
    leadTimeUnit: {
      type: String,
      enum: ['days', 'weeks'],
      default: 'days',
    },
    productionTime: { type: Number, min: 0 },
    productionTimeUnit: { type: String, enum: ['days', 'weeks'], default: 'days' },
    
    // Payment Terms
    paymentTerms: {
      type: String,
      default: 'negotiable',
    },
    advanceRequired: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    
    // Shipping/Incoterms
    incoterms: {
      type: String,
      enum: ['FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP', 'FAS', 'CPT', 'CIP', 'other'],
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    shippingEstimate: mongoose.Schema.Types.Mixed,
    shippingTerms: String,
    packaging: mongoose.Schema.Types.Mixed,
    samplePrice: { type: Number, min: 0 },
    taxes: { taxRate: { type: Number, min: 0 }, amount: { type: Number, min: 0 }, description: String },
    specialClauses: [String],
    
    // Product Details
    description: {
      type: String,
      maxlength: 1000,
    },
    specifications: {
      type: String,
      maxlength: 500,
    },
    certifications: [String],
    
    // Customization
    customizationAvailable: {
      type: Boolean,
      default: false,
    },
    customizationDetails: String,
    
    // Status
    status: {
      type: String,
      enum: ['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised', 'accepted', 'buyer_accepted', 'agreement_pending', 'agreement_signed', 'rejected', 'expired', 'withdrawn', 'won', 'lost'],
      default: 'pending',
      index: true,
    },
    revisionNumber: {
      type: Number,
      default: 1,
    },
    revisionHistory: [
      {
        version: Number,
        revisedAt: Date,
        revisedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        unitPrice: Number,
        totalPrice: Number,
        minimumOrderQuantity: Number,
        suppliedQuantity: Number,
        leadTime: Number,
        leadTimeUnit: String,
        productionTime: Number,
        productionTimeUnit: String,
        paymentTerms: String,
        advanceRequired: Number,
        incoterms: String,
        shippingCost: Number,
        description: String,
        specifications: String,
        notes: String,
        reason: String,
        pricingTiers: mongoose.Schema.Types.Mixed,
        shippingEstimate: mongoose.Schema.Types.Mixed,
        shippingTerms: String,
        packaging: mongoose.Schema.Types.Mixed,
        samplePrice: Number,
        taxes: mongoose.Schema.Types.Mixed,
        specialClauses: [String],
        changedFields: [String],
        documents: [mongoose.Schema.Types.Mixed],
        snapshot: mongoose.Schema.Types.Mixed,
      },
    ],
    negotiationHistory: [
      {
        action: {
          type: String,
          enum: ['submitted', 'buyer_counter', 'seller_revision', 'accepted', 'rejected', 'message'],
        },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        message: String,
        unitPrice: Number,
        totalPrice: Number,
        minimumOrderQuantity: Number,
        suppliedQuantity: Number,
        leadTime: Number,
        leadTimeUnit: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    expiryDate: {
      type: Date,
    },
    
    // Communication
    notes: {
      type: String,
      maxlength: 1000,
    },
    buyerMessage: {
      type: String,
      maxlength: 1000,
    },
    sellerMessage: {
      type: String,
      maxlength: 1000,
    },
    attachments: [
      {
        url: String,
        filename: String,
        uploadedAt: Date,
      },
    ],
    
    // Acceptance/Rejection
    acceptedAt: Date,
    rejectedAt: Date,
    rejectionReason: String,
    tradeOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    previousStatus: String,
    agreement: {
      agreementNumber: String,
      documentId: mongoose.Schema.Types.ObjectId,
      status: { type: String, enum: ['not_required', 'draft', 'awaiting_seller_signature', 'awaiting_buyer_signature', 'completed', 'void'], default: 'not_required' },
      sellerConfirmedAt: Date,
      completedAt: Date,
    },
    approvalHistory: [{ action: String, previousStatus: String, newStatus: String, actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorRole: String, notes: String, documents: [mongoose.Schema.Types.Mixed], createdAt: { type: Date, default: Date.now } }],
    structuredNotes: { type: [tradeNoteSchema], default: [] },
    tradeDocuments: { type: [tradeDocumentSchema], default: [] },
    activityTimeline: { type: [activitySchema], default: [] },
  },
  {
    timestamps: true,
    indexes: [
      { rfqId: 1, status: 1 },
      { rfqId: 1, userId: 1, createdAt: -1 },
      { userId: 1, status: 1, createdAt: -1 },
      { sellerId: 1, createdAt: -1 },
      { sellerId: 1, status: 1, createdAt: -1 },
      { productId: 1, createdAt: -1 },
      { status: 1, expiryDate: 1 },
    ],
  }
);

quotationSchema.index({
  status: 'text',
  description: 'text',
  specifications: 'text',
  notes: 'text',
  buyerMessage: 'text',
  sellerMessage: 'text',
});

export default mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
