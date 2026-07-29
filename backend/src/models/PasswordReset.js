import mongoose from 'mongoose';

const passwordResetSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true, index: true, immutable: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date },
    verificationAttempts: { type: Number, default: 0, min: 0 },
    failedOtpCycles: { type: Number, default: 0, min: 0 },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'exhausted', 'used', 'invalidated'],
      default: 'pending',
      index: true,
    },
    verifiedAt: { type: Date },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date },
    lockStatus: { type: Boolean, default: false },
    lockExpiresAt: { type: Date },
    lastSentAt: { type: Date },
    lastAttemptAt: { type: Date },
    ipAddress: { type: String, select: false },
    userAgent: { type: String, select: false },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

passwordResetSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
passwordResetSchema.index({ email: 1, lockExpiresAt: 1 });

const PasswordReset = mongoose.models.PasswordReset || mongoose.model('PasswordReset', passwordResetSchema);

export default PasswordReset;
