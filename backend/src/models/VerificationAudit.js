import mongoose from 'mongoose';

const verificationAuditSchema = new mongoose.Schema(
  {
    verificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SellerVerification',
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'profile_submitted',
        'document_uploaded',
        'document_approved',
        'document_rejected',
        'document_needs_update',
        'document_archived',
        'information_requested',
        'verification_approved',
        'verification_rejected',
        'verification_suspended',
        'status_changed',
        'factory_inspection_scheduled',
        'reverification_requested',
      ],
    },
    fromStatus: String,
    toStatus: String,
    notes: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

verificationAuditSchema.index({ verificationId: 1, createdAt: -1 });

export default mongoose.models.VerificationAudit ||
  mongoose.model('VerificationAudit', verificationAuditSchema);
