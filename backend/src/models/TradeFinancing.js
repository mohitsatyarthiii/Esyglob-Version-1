// models/TradeFinancing.js
import mongoose from 'mongoose';

const tradeFinancingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  applicationNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  type: {
    type: String,
    enum: ['po_financing', 'invoice_factoring', 'supply_chain', 'working_capital'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'approved', 'funded', 'repaying', 'completed', 'defaulted', 'rejected', 'cancelled'],
    default: 'draft'
  },
  
  // Financial Details
  requestedAmount: { type: Number, required: true },
  approvedAmount: Number,
  currency: { type: String, default: 'USD' },
  interestRate: Number,
  termDays: Number,
  processingFee: Number,
  
  // Repayment
  repaymentSchedule: [{
    dueDate: Date,
    amount: Number,
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' }
  }],
  totalRepaid: { type: Number, default: 0 },
  remainingBalance: Number,
  
  // PO Financing Specific
  purchaseOrder: {
    poNumber: String,
    buyer: String,
    value: Number,
    issueDate: Date,
    deliveryDate: Date
  },
  
  // Invoice Factoring Specific
  invoices: [{
    invoiceNumber: String,
    buyer: String,
    amount: Number,
    issueDate: Date,
    dueDate: Date,
    status: { type: String, enum: ['pending', 'verified', 'funded', 'collected'], default: 'pending' }
  }],
  
  // Supply Chain Specific
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
  
  // Documents
  documents: [{
    type: String,
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Bank Details
  bankAccount: {
    bankName: String,
    accountNumber: String,
    accountHolder: String,
    swiftCode: String
  },
  
  // Credit Assessment
  creditScore: Number,
  riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
  
  // Approval
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  fundedAt: Date,
  completedAt: Date,
  
  // Notes
  notes: String,
  rejectionReason: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

tradeFinancingSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('TradeFinancing').countDocuments();
    this.applicationNumber = `TFN${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.TradeFinancing || mongoose.model('TradeFinancing', tradeFinancingSchema);