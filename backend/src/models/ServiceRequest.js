import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      unique: true,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true,
      index: true,
    },
    serviceKey: {
      type: String,
      required: true,
      index: true,
    },
    serviceTitle: String,
    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'documents_required', 'in_progress', 'completed', 'cancelled'],
      default: 'submitted',
      index: true,
    },
    priority: {
      type: String,
      enum: ['normal', 'high', 'urgent'],
      default: 'normal',
    },
    companyName: String,
    contactName: String,
    contactEmail: String,
    contactPhone: String,
    subject: String,
    details: String,
    requirements: mongoose.Schema.Types.Mixed,
    documents: [
      {
        name: String,
        url: String,
        type: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'reupload_required'], default: 'pending' },
        rejectionReason: String,
        reviewerNotes: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    pricing: {
      currency: { type: String, default: 'INR' },
      baseCost: { type: Number, default: 0 },
      additionalCharges: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      gstRate: { type: Number, default: 18 },
      gstAmount: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      totalPayable: { type: Number, default: 0 },
    },
    paymentStatus: { type: String, enum: ['pending', 'processing', 'paid', 'refunded', 'failed', 'cancelled'], default: 'pending', index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    assignedTeam: String,
    assignedExecutive: String,
    expectedCompletionDate: Date,
    progress: { type: Number, min: 0, max: 100, default: 10 },
    notes: String,
    remarks: String,
    history: [
      {
        status: String,
        note: String,
        createdAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
  },
  { timestamps: true }
);

serviceRequestSchema.pre('validate', function setRequestNumber(next) {
  if (!this.requestNumber) {
    this.requestNumber = `SRV${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  next();
});

export default mongoose.models.ServiceRequest ||
  mongoose.model('ServiceRequest', serviceRequestSchema);
