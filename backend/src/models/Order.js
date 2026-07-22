import mongoose from 'mongoose';
import crypto from 'crypto';
import { tradeDocumentSchema, tradeNoteSchema } from './schemas/tradeArtifact.schema.js';

function generateOrderNumber(prefix) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${crypto.randomInt(1000, 10000)}`;
}

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true,
  },

  status: {
    type: String,
    enum: [
      'draft',
      'pending',
      'pending_approval',
      'awaiting_payment',
      'pending_payment',
      'payment_confirmed',
      'confirmed',
      'processing',
      'production',
      'ready_to_ship',
      'payment_success',
      'preparing_shipment',
      'pickup_scheduled',
      'picked_up',
      'warehouse_processing',
      'in_transit',
      'custom_clearance',
      'out_for_delivery',
      'shipped',
      'delivered',
      'completed',
      'cancelled',
      'refunded',
      'failed',
      'returned',
      'rejected',
      'disputed',
    ],
    default: 'pending',
  },
  orderType: {
    type: String,
    enum: ['sample', 'bulk'],
    default: 'bulk',
  },
  orderSubType: {
    type: String,
    enum: ['sample_order', 'trade_order', 'direct_order', 'chat_order'],
    default: 'direct_order',
  },
  quantity: Number,
  pricePerUnit: Number,
  totalPrice: Number,
  rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ' },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', index: true },

  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    sku: String,
    quantity: Number,
    unitPrice: Number,
    totalPrice: Number,
    specifications: String,
    image: String,
    unit: String,
  }],

  subtotal: Number,
  shippingCost: Number,
  insuranceCost: Number,
  taxAmount: Number,
  discount: Number,
  merchandiseAmount: Number,
  platformFeeRate: Number,
  platformFee: { type: Number, default: 0 },
  gatewayFee: { type: Number, default: 0 },
  netAmount: Number,
  totalAmount: Number,
  currency: { type: String, default: 'INR' },

  paymentMethod: { type: String, enum: ['bank_transfer', 'credit_card', 'escrow', 'letter_of_credit'] },
  paymentStatus: { type: String, enum: ['pending', 'partial', 'paid', 'refunded'], default: 'pending' },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  escrowId: { type: mongoose.Schema.Types.ObjectId, ref: 'EscrowTransaction' },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', index: true },
  unit: String,

  shippingAddress: {
    name: String,
    fullName: String,
    company: String,
    email: String,
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    zipCode: String,
    phone: String,
  },
  shippingMethod: String,
  trackingNumber: String,
  estimatedDelivery: Date,
  estimatedDeliveryDate: Date,
  actualDelivery: Date,

  tradeAssurance: {
    isProtected: { type: Boolean, default: false },
    assuranceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TradeAssurance' },
    enabled: Boolean,
    coverageAmount: Number,
    terms: String,
  },

  inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QualityInspection' },

  messages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    attachments: [String],
    createdAt: { type: Date, default: Date.now },
  }],

  disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute' },

  review: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    createdAt: Date,
  },

  buyerNotes: String,
  sellerNotes: String,
  buyerCompany: mongoose.Schema.Types.Mixed,
  sellerCompany: mongoose.Schema.Types.Mixed,
  tradeInformation: mongoose.Schema.Types.Mixed,
  sourceSnapshot: mongoose.Schema.Types.Mixed,
  platformServices: mongoose.Schema.Types.Mixed,
  documents: [mongoose.Schema.Types.Mixed],
  structuredNotes: { type: [tradeNoteSchema], default: [] },
  tradeDocuments: { type: [tradeDocumentSchema], default: [] },
  agreement: {
    required: { type: Boolean, default: false },
    documentId: mongoose.Schema.Types.ObjectId,
    status: { type: String, enum: ['not_required', 'draft', 'awaiting_seller_signature', 'awaiting_buyer_signature', 'completed', 'void'], default: 'not_required' },
    completedAt: Date,
  },
  production: {
    status: { type: String, default: 'not_started' },
    updates: [{ stage: String, note: String, attachments: [String], updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, timestamp: { type: Date, default: Date.now } }],
    startedAt: Date,
    completedAt: Date,
  },
  workflow: {
    currentStage: { type: String, default: 'order_created' },
    previousStage: String,
    nextStage: String,
    responsibleParty: String,
    pendingActions: [String],
    blockedReasons: [String],
    lastEvaluatedAt: Date,
  },
  auditLogs: [{ action: String, fromStatus: String, toStatus: String, actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorRole: String, note: String, metadata: mongoose.Schema.Types.Mixed, timestamp: { type: Date, default: Date.now } }],

  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  orderDate: { type: Date, default: Date.now },
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  cancelReason: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

orderSchema.pre('save', async function setOrderDefaults() {
  if (this.isNew && !this.orderNumber) {
    const prefix = (this.orderType === 'sample' || this.orderSubType === 'sample_order') ? 'SAM' : 'ORD';
    this.orderNumber = generateOrderNumber(prefix);
  }

  if (!this.buyerId && this.userId) this.buyerId = this.userId;
  if (!this.userId && this.buyerId) this.userId = this.buyerId;
  if (this.totalPrice && !this.totalAmount) this.totalAmount = this.totalPrice;
  if (this.totalAmount && !this.totalPrice) this.totalPrice = this.totalAmount;
  if (!this.currency) this.currency = 'INR';
  this.updatedAt = new Date();
});

orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, orderType: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, orderType: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, status: 1, createdAt: -1 });
orderSchema.index({ orderSubType: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ shipmentId: 1, status: 1 });
orderSchema.index({ invoiceId: 1, paymentStatus: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({
  orderNumber: 'text',
  status: 'text',
  orderType: 'text',
  orderSubType: 'text',
  paymentStatus: 'text',
  'shippingAddress.email': 'text',
  'shippingAddress.phone': 'text',
  'shippingAddress.company': 'text',
  'products.name': 'text',
  'products.sku': 'text',
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
