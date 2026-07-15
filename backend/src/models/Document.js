// models/Document.js
import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Document Details
  documentNumber: {
    type: String,
    unique: true,
    required: true
  },
  name: String,
  type: {
    type: String,
    enum: ['commercial_invoice', 'packing_list', 'bill_of_lading', 'air_waybill', 'certificate_of_origin', 'insurance_certificate', 'export_declaration', 'import_declaration', 'bill_of_entry', 'letter_of_credit', 'bank_guarantee', 'proforma_invoice', 'purchase_order', 'inspection_certificate', 'gst_invoice', 'customs_declaration', 'trust_receipt', 'bill_of_exchange', 'other'],
    required: true
  },
  category: {
    type: String,
    enum: ['export', 'import', 'finance', 'shipping', 'compliance', 'other']
  },
  
  // Related Entities
  orderId: { type: mongoose.Schema.Types.ObjectId },
  shipmentId: { type: mongoose.Schema.Types.ObjectId },
  transactionId: { type: mongoose.Schema.Types.ObjectId },
  
  // Document Content
  template: String,
  content: mongoose.Schema.Types.Mixed,
  
  // Parties
  issuer: {
    name: String,
    company: String,
    address: String,
    country: String
  },
  recipient: {
    name: String,
    company: String,
    address: String,
    country: String
  },
  
  // Document Data
  data: {
    invoiceNumber: String,
    date: Date,
    dueDate: Date,
    currency: String,
    items: [{
      description: String,
      hsCode: String,
      quantity: Number,
      unit: String,
      unitPrice: Number,
      totalPrice: Number
    }],
    subtotal: Number,
    tax: Number,
    total: Number,
    terms: String,
    notes: String
  },
  
  // File
  fileUrl: String,
  fileSize: Number,
  fileType: String,
  
  // Signatures
  signatures: [{
    signerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    signedAt: Date,
    ipAddress: String
  }],
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'generated', 'signed', 'shared', 'expired', 'archived'],
    default: 'draft'
  },
  rejectionReason: String,
  reviewerNotes: String,
  
  // Sharing
  sharedWith: [{
    email: String,
    accessLevel: { type: String, enum: ['view', 'download', 'edit'] },
    sharedAt: Date,
    expiresAt: Date
  }],
  
  // Metadata
  tags: [String],
  isTemplate: { type: Boolean, default: false },
  language: { type: String, default: 'en' },
  
  // Retention
  retentionPeriod: { type: Number, default: 7 }, // years
  expiryDate: Date,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

documentSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('Document').countDocuments();
    this.documentNumber = `DOC${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Document || mongoose.model('Document', documentSchema);
