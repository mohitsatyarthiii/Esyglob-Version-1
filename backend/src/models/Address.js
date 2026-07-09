import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    landmark: { type: String, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

addressSchema.index({ userId: 1, isDefault: -1, updatedAt: -1 });

export default mongoose.models.Address || mongoose.model('Address', addressSchema);
