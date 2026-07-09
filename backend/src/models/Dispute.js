// models/Dispute.js
import mongoose from 'mongoose';

const disputeSchema = new mongoose.Schema({
  disputeNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Parties
  initiatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  respondentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Related Transaction
  transactionType: {
    type: String,
    enum: ['order', 'escrow', 'shipping', 'quality', 'payment'],
    required: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Dispute Details
  type: {
    type: String,
    enum: ['quality', 'delivery', 'payment', 'contract', 'other'],
    required: true
  },
  title: String,
  description: String,
  desiredResolution: String,
  claimAmount: Number,
  currency: { type: String, default: 'USD' },
  
  // Status
  status: {
    type: String,
    enum: ['filed', 'under_review', 'evidence_gathering', 'mediation', 'resolution_proposed', 'accepted', 'appealed', 'resolved', 'closed'],
    default: 'filed'
  },
  
  // Mediator
  mediatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mediatorName: String,
  
  // Evidence
  evidence: [{
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['photo', 'video', 'document', 'message', 'other'] },
    title: String,
    description: String,
    url: String,
    submittedAt: { type: Date, default: Date.now }
  }],
  
  // Timeline
  timeline: [{
    action: String,
    description: String,
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date, default: Date.now }
  }],
  
  // Resolution
  resolution: {
    type: { type: String, enum: ['full_refund', 'partial_refund', 'replacement', 'compensation', 'dismissed', 'other'] },
    amount: Number,
    description: String,
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    proposedAt: Date,
    acceptedByInitiator: { type: Boolean, default: false },
    acceptedByRespondent: { type: Boolean, default: false },
    acceptedAt: Date,
    implementedAt: Date
  },
  
  // Communication
  messages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    attachments: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Timeline
  filedAt: { type: Date, default: Date.now },
  resolvedAt: Date,
  closedAt: Date,
  
  // Fees
  filingFee: Number,
  refundAmount: Number,
  
  // Notes
  internalNotes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

disputeSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('Dispute').countDocuments();
    this.disputeNumber = `DSP${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Dispute || mongoose.model('Dispute', disputeSchema);