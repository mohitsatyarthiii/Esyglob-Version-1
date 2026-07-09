// models/EscrowTransaction.js
import mongoose from 'mongoose';

const escrowTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller'
  },
  transactionNumber: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending_seller', 'funded', 'in_progress', 'shipped', 'delivered', 'inspection', 'completed', 'disputed', 'refunded', 'cancelled'],
    default: 'draft'
  },
  
  // Order Details
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  description: String,
  
  // Financial Details
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  exchangeRate: Number,
  
  // Milestones
  milestones: [{
    title: String,
    percentage: Number,
    amount: Number,
    status: { type: String, enum: ['pending', 'funded', 'released', 'refunded'], default: 'pending' },
    dueDate: Date,
    releasedAt: Date,
    condition: String  }],
  
  // Payment Details
  paymentMethod: { type: String, enum: ['bank_transfer', 'credit_card', 'wire', 'digital'] },
  paymentReference: String,
  fundedAt: Date,
  
  // Inspection
  inspectionPeriod: { type: Number, default: 7 }, // days
  inspectionStartDate: Date,
  inspectionEndDate: Date,
  inspectionResult: { type: String, enum: ['approved', 'rejected', 'partial'] },
  
  // Release
  releasedAmount: Number,
  releasedAt: Date,
  refundedAmount: Number,
  refundedAt: Date,
  
  // Dispute
  disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute' },
  
  // Fees
  escrowFee: Number,
  platformFee: Number,
  
  // Documents
  agreementUrl: String,
  invoiceUrl: String,
  
  // Terms
  terms: String,
  
  // Notes
  notes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

escrowTransactionSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('EscrowTransaction').countDocuments();
    this.transactionNumber = `ESC${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.EscrowTransaction || mongoose.model('EscrowTransaction', escrowTransactionSchema);