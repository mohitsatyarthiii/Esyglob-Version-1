import mongoose from 'mongoose';
import { mediaIntegrityPlugin } from '../lib/media-integrity.js';

const certificationSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    name: { type: String, required: true },
    issuer: String,
    certificateNumber: String,
    scope: String,
    documentUrl: String,
    issuedAt: Date,
    validUntil: Date,
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'expired'],
      default: 'pending',
      index: true,
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
  },
  { timestamps: true }
);

certificationSchema.index({ sellerId: 1, status: 1 });
certificationSchema.plugin(mediaIntegrityPlugin, { entity: 'certifications', paths: ['documentUrl'] });

export default mongoose.models.Certification ||
  mongoose.model('Certification', certificationSchema);
