import mongoose from 'mongoose';

const verificationProviderSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
  provider: { type: String, enum: ['digilocker'], required: true },
  stateHash: { type: String, required: true, unique: true },
  codeVerifierEncrypted: { type: String, required: true },
  status: { type: String, enum: ['initiated', 'processing', 'completed', 'cancelled', 'failed'], default: 'initiated' },
  expiresAt: { type: Date, required: true, index: true },
  completedAt: Date,
}, { timestamps: true });

verificationProviderSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.VerificationProviderSession
  || mongoose.model('VerificationProviderSession', verificationProviderSessionSchema);
