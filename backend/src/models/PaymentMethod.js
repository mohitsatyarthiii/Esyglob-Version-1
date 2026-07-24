import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['buyer', 'seller'], required: true, index: true },
    type: { type: String, enum: ['bank_account', 'upi', 'card'], required: true, index: true },
    label: String,
    holderName: String,
    bankName: String,
    ifsc: String,
    maskedAccountNumber: String,
    encryptedAccountNumber: String,
    upiId: String,
    encryptedUpiId: String,
    cardBrand: String,
    cardLast4: String,
    cardExpiryMonth: String,
    cardExpiryYear: String,
    providerToken: String,
    providerValidationId: String,
    providerValidationStatus: String,
    verifiedAt: Date,
    lastVerificationAt: Date,
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'failed'],
      default: 'pending',
      index: true,
    },
    verificationMessage: String,
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

paymentMethodSchema.index({ userId: 1, type: 1, createdAt: -1 });

export default mongoose.models.PaymentMethod || mongoose.model('PaymentMethod', paymentMethodSchema);
