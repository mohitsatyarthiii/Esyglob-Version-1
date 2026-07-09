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
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
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

serviceRequestSchema.pre('validate', async function setRequestNumber(next) {
  if (!this.requestNumber) {
    const count = await mongoose.model('ServiceRequest').countDocuments();
    this.requestNumber = `SRV${String(count + 1).padStart(8, '0')}`;
  }
  next();
});

export default mongoose.models.ServiceRequest ||
  mongoose.model('ServiceRequest', serviceRequestSchema);
