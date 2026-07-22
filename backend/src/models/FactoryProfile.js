import mongoose from 'mongoose';

const machinerySchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true },
  quantity: { type: Number, min: 1, default: 1 },
  model: { type: String, trim: true },
  year: { type: Number, min: 1900, max: 2200 },
}, { _id: false });

const factoryProfileSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, unique: true, index: true },
  name: { type: String, trim: true },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    pincode: String,
    latitude: Number,
    longitude: Number,
  },
  floorArea: { type: String, trim: true },
  description: { type: String, trim: true, maxlength: 4000 },
  employeeCount: { type: Number, min: 0 },
  productionLines: { type: Number, min: 0 },
  machinery: { type: [machinerySchema], default: [] },
  monthlyCapacity: { type: String, trim: true },
  annualCapacity: { type: String, trim: true },
  capabilities: { type: [String], default: [] },
  qualityControl: { type: String, trim: true },
  qualityProcesses: { type: [String], default: [] },
  exportMarkets: { type: [String], default: [] },
  images: { type: [String], default: [] },
  videos: { type: [String], default: [] },
  certifications: { type: [mongoose.Schema.Types.Mixed], default: [] },
  verificationStatus: {
    type: String,
    enum: ['draft', 'submitted', 'pending_review', 'under_review', 'inspection_scheduled', 'approved', 'verified', 'rejected', 'expired', 'reverification_required'],
    default: 'draft',
    index: true,
  },
  inspection: {
    scheduledAt: Date,
    completedAt: Date,
    provider: String,
    inspectorName: String,
    reportUrl: String,
    notes: String,
  },
  inspectedAt: Date,
  verifiedAt: Date,
  verificationExpiresAt: Date,
  rejectionReason: String,
  lastDraftSavedAt: Date,
}, { timestamps: true });

factoryProfileSchema.index({ verificationStatus: 1, updatedAt: -1 });

export default mongoose.models.FactoryProfile || mongoose.model('FactoryProfile', factoryProfileSchema);
