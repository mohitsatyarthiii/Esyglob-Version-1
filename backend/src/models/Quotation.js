import mongoose from 'mongoose';

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
    
    // Payment Terms
    paymentTerms: {
      type: String,
      enum: ['immediate', '7days', '15days', '30days', '60days', 'negotiable'],
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
    shippingEstimate: {
      method: String,
      cost: { type: Number, default: 0 },
      currency: String,
      estimatedDays: Number,
      destinationPort: String,
      notes: String,
    },
    
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
      enum: ['pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised', 'accepted', 'rejected', 'expired', 'withdrawn', 'won', 'lost'],
      default: 'pending',
      index: true,
    },
    revisionNumber: {
      type: Number,
      default: 1,
    },
    revisionHistory: [
      {
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
