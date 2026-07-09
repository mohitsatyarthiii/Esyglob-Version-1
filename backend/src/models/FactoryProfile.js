import mongoose from 'mongoose';

const factoryProfileSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, unique: true, index: true },
    name: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
      coordinates: { latitude: Number, longitude: Number },
    },
    floorArea: String,
    description: String,
    employeeCount: Number,
    productionLines: Number,
    machinery: [{ name: String, quantity: Number, model: String, year: Number }],
    monthlyCapacity: String,
    annualCapacity: String,
    capabilities: [String],
    qualityControl: String,
    images: [String],
    videos: [String],
    verificationStatus: {
      type: String,
      enum: ['draft', 'unverified', 'submitted', 'under_review', 'pending_review', 'approved', 'verified', 'rejected'],
      default: 'draft',
    },
    lastDraftSavedAt: Date,
    inspectedAt: Date,
    inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

factoryProfileSchema.index({ sellerId: 1, verificationStatus: 1 });

export default mongoose.models.FactoryProfile ||
  mongoose.model('FactoryProfile', factoryProfileSchema);
