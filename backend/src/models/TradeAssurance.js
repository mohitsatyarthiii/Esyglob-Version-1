// models/TradeAssurance.js
import mongoose from 'mongoose';

const tradeAssuranceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  assuranceNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  status: {
    type: String,
    enum: ['active', 'production', 'shipped', 'delivered', 'inspection', 'completed', 'disputed', 'refunded', 'expired'],
    default: 'active'
  },
  
  // Order Details
  orderAmount: Number,
  currency: { type: String, default: 'USD' },
  orderDate: Date,
  expectedDeliveryDate: Date,
  actualDeliveryDate: Date,
  
  // Quality Requirements
  qualityStandards: String,
  specifications: String,
  samplesApproved: { type: Boolean, default: false },
  
  // Inspection
  inspectionRequired: { type: Boolean, default: false },
  inspectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QualityInspection' },
  inspectionResult: { type: String, enum: ['passed', 'failed', 'conditional'] },
  
  // Delivery
  shippingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingOrder' },
  deliveredOnTime: Boolean,
  deliveryDelay: Number, // days
  
  // Dispute
  disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute' },
  
  // Refund
  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,
  
  // Coverage
  coverageAmount: Number,
  coverageType: { type: String, enum: ['full', 'partial'] },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

tradeAssuranceSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('TradeAssurance').countDocuments();
    this.assuranceNumber = `TAS${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.TradeAssurance || mongoose.model('TradeAssurance', tradeAssuranceSchema);