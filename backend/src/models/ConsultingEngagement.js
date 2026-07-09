// models/ConsultingEngagement.js
import mongoose from 'mongoose';

const consultingEngagementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  engagementNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Engagement Details
  type: {
    type: String,
    enum: ['market_entry', 'supply_chain', 'sourcing', 'export_readiness', 'trade_finance', 'compliance', 'custom'],
    required: true
  },
  title: String,
  description: String,
  
  status: {
    type: String,
    enum: ['inquiry', 'proposal_sent', 'proposal_accepted', 'in_progress', 'delivered', 'completed', 'cancelled'],
    default: 'inquiry'
  },
  
  // Consultant
  consultantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  consultantName: String,
  consultantBio: String,
  
  // Scope
  scope: {
    objectives: [String],
    deliverables: [String],
    exclusions: [String],
    methodology: String
  },
  
  // Timeline
  startDate: Date,
  endDate: Date,
  estimatedDuration: String, // e.g., "4 weeks"
  milestones: [{
    title: String,
    description: String,
    dueDate: Date,
    completedDate: Date,
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'delayed'] }
  }],
  
  // Financials
  fee: Number,
  currency: { type: String, default: 'USD' },
  paymentTerms: String,
  paymentSchedule: [{
    percentage: Number,
    amount: Number,
    dueDate: Date,
    paidDate: Date,
    status: { type: String, enum: ['pending', 'paid'] }
  }],
  
  // Deliverables
  deliverables: [{
    title: String,
    description: String,
    dueDate: Date,
    deliveredDate: Date,
    fileUrl: String,
    status: { type: String, enum: ['pending', 'in_progress', 'delivered', 'accepted', 'revision'] }
  }],
  
  // Communication
  meetings: [{
    title: String,
    date: Date,
    duration: Number, // minutes
    type: { type: String, enum: ['kickoff', 'progress', 'review', 'final', 'other'] },
    notes: String,
    recordingUrl: String
  }],
  
  // Documents
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Feedback
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    review: String,
    submittedAt: Date
  },
  
  // NDA/Contract
  ndaSigned: { type: Boolean, default: false },
  contractSigned: { type: Boolean, default: false },
  contractUrl: String,
  
  // Notes
  internalNotes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

consultingEngagementSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('ConsultingEngagement').countDocuments();
    this.engagementNumber = `CNS${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.ConsultingEngagement || mongoose.model('ConsultingEngagement', consultingEngagementSchema);