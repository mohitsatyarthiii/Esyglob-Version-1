import mongoose from 'mongoose';
import { activitySchema, tradeDocumentSchema, tradeNoteSchema } from './schemas/tradeArtifact.schema.js';

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: { type: String, trim: true },
    idempotencyKey: { type: String, trim: true },
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
      min: 1,
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
      min: 0,
    },
    shippingEstimate: mongoose.Schema.Types.Mixed,
    shippingTerms: String,
    packaging: mongoose.Schema.Types.Mixed,
    warranty: String,
    samplePrice: { type: Number, min: 0 },
    taxes: { taxRate: { type: Number, min: 0, max: 100 }, amount: { type: Number, min: 0 }, description: String },
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
    productConfiguration: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    productConfigurationHistory: [{
      version: Number,
      changedFields: [String],
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      actorRole: String,
      reason: String,
      createdAt: { type: Date, default: Date.now },
      previousSnapshot: mongoose.Schema.Types.Mixed,
      snapshot: mongoose.Schema.Types.Mixed,
    }],
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
      enum: ['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised', 'accepted', 'buyer_accepted', 'final_quotation_pending', 'final_quotation_signed', 'agreement_pending', 'agreement_signed', 'rejected', 'expired', 'withdrawn', 'won', 'lost'],
      default: 'pending',
      index: true,
    },
    revisionNumber: {
      type: Number,
      default: 1,
    },
    negotiationVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentOffer: {
      action: { type: String, enum: ['submitted', 'buyer_counter', 'seller_revision', 'seller_accepted_counter', 'accepted'] },
      actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      actorRole: { type: String, enum: ['buyer', 'seller'] },
      unitPrice: Number,
      productSubtotal: Number,
      shippingCost: Number,
      taxAmount: Number,
      totalPrice: Number,
      minimumOrderQuantity: Number,
      suppliedQuantity: Number,
      leadTime: Number,
      leadTimeUnit: String,
      paymentTerms: String,
      incoterms: String,
      notes: String,
      previousUnitPrice: Number,
      createdAt: Date,
      sequence: Number,
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
        productSubtotal: Number,
        shippingCost: Number,
        taxAmount: Number,
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
        eventId: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
        rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ' },
        quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
        action: {
          type: String,
          enum: ['submitted', 'buyer_counter', 'seller_revision', 'seller_accepted_counter', 'accepted', 'rejected', 'expired', 'withdrawn', 'finalized', 'seller_signed', 'buyer_signed', 'message'],
        },
        idempotencyKey: String,
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        actorRole: { type: String, enum: ['buyer', 'seller'] },
        message: String,
        notes: String,
        status: String,
        previousOffer: mongoose.Schema.Types.Mixed,
        newOffer: mongoose.Schema.Types.Mixed,
        changedTerms: [String],
        messageReference: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
        notificationReference: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
        previousUnitPrice: Number,
        unitPrice: Number,
        totalPrice: Number,
        minimumOrderQuantity: Number,
        suppliedQuantity: Number,
        leadTime: Number,
        leadTimeUnit: String,
        createdAt: { type: Date, default: Date.now },
        timestamp: { type: Date, default: Date.now },
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
      sellerSignedAt: Date,
      buyerSignedAt: Date,
      completedAt: Date,
    },
    finalQuotation: {
      finalQuotationNumber: String,
      documentId: mongoose.Schema.Types.ObjectId,
      status: { type: String, enum: ['not_started', 'seller_preparation', 'awaiting_seller_signature', 'awaiting_buyer_signature', 'changes_requested', 'signed', 'cancelled', 'expired'], default: 'not_started' },
      version: { type: Number, min: 1, default: 1 },
      preparedAt: Date,
      sellerSignedAt: Date,
      buyerSignedAt: Date,
      lockedAt: Date,
    },
    directOrderEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    directOrderEnabledAt: Date,
    approvalHistory: [{ action: String, previousStatus: String, newStatus: String, actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorRole: String, notes: String, documents: [mongoose.Schema.Types.Mixed], createdAt: { type: Date, default: Date.now } }],
    structuredNotes: { type: [tradeNoteSchema], default: [] },
    tradeDocuments: { type: [tradeDocumentSchema], default: [] },
    activityTimeline: { type: [activitySchema], default: [] },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
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

const negotiationStatus = {
  submitted: 'submitted',
  buyer_counter: 'countered',
  seller_revision: 'revised',
  seller_accepted_counter: 'buyer_accepted',
  accepted: 'buyer_accepted',
  rejected: 'rejected',
  finalized: 'final_quotation_pending',
  seller_signed: 'final_quotation_pending',
  buyer_signed: 'final_quotation_signed',
};

quotationSchema.pre('validate', function normalizeNegotiationEvents() {
  this.quotationNumber ||= `QT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(this._id).slice(-8).toUpperCase()}`;
  let previous = null;
  for (const event of this.negotiationHistory || []) {
    event.eventId ||= new mongoose.Types.ObjectId();
    event.rfqId ||= this.rfqId?._id || this.rfqId;
    event.quotationId ||= this._id;
    event.timestamp ||= event.createdAt || new Date();
    event.notes ||= event.message;
    event.status ||= negotiationStatus[event.action] || this.status;
    const current = {
      unitPrice: event.unitPrice,
      productSubtotal: event.productSubtotal,
      shippingCost: event.shippingCost,
      taxAmount: event.taxAmount,
      totalPrice: event.totalPrice,
      minimumOrderQuantity: event.minimumOrderQuantity,
      suppliedQuantity: event.suppliedQuantity,
      leadTime: event.leadTime,
      leadTimeUnit: event.leadTimeUnit,
    };
    event.previousOffer ||= previous ? { ...previous } : undefined;
    event.newOffer ||= { ...current };
    if (!event.changedTerms?.length && previous) {
      event.changedTerms = Object.keys(current).filter((key) => current[key] !== undefined && String(current[key]) !== String(previous[key]));
    }
    if (event.unitPrice !== undefined) previous = current;
  }
});

quotationSchema.index({
  status: 'text',
  description: 'text',
  specifications: 'text',
  notes: 'text',
  buyerMessage: 'text',
  sellerMessage: 'text',
});
quotationSchema.index(
  { rfqId: 1, userId: 1 },
  {
    unique: true,
    name: 'one_open_quotation_per_manufacturer_rfq',
    partialFilterExpression: {
      status: { $in: ['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised', 'buyer_accepted', 'final_quotation_pending', 'final_quotation_signed'] },
    },
  }
);
quotationSchema.index({ 'negotiationHistory.eventId': 1 });
quotationSchema.index({ 'negotiationHistory.idempotencyKey': 1 });
quotationSchema.index({ quotationNumber: 1 }, { unique: true, sparse: true });
quotationSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true, sparse: true, name: 'one_quotation_per_seller_idempotency_key' });

export default mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
