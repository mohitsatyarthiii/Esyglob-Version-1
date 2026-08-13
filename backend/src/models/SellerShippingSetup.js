import mongoose from 'mongoose';

const providerMappingSchema = new mongoose.Schema({
  providerKey: { type: String, enum: ['delhivery', 'shiprocket'], required: true },
  status: { type: String, enum: ['pending', 'active', 'failed', 'disabled'], default: 'pending', index: true },
  locationId: String,
  locationName: String,
  addressHash: String,
  lastAttemptAt: Date,
  lastVerifiedAt: Date,
  retryCount: { type: Number, default: 0 },
  error: { code: String, message: String, occurredAt: Date },
  metadata: mongoose.Schema.Types.Mixed,
}, { _id: false });

const sellerShippingSetupSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, unique: true },
  pickupSource: { type: String, enum: ['manual', 'seller', 'factory', 'none'], default: 'none' },
  manualPickupAddress: mongoose.Schema.Types.Mixed,
  addressHash: { type: String, index: true },
  pickupAddress: mongoose.Schema.Types.Mixed,
  readiness: { type: String, enum: ['invalid', 'pending', 'partial', 'ready', 'failed'], default: 'pending', index: true },
  providers: { type: [providerMappingSchema], default: [] },
  lastSynchronizedAt: Date,
}, { timestamps: true });

sellerShippingSetupSchema.index({ 'providers.providerKey': 1, 'providers.status': 1 });

export default mongoose.models.SellerShippingSetup
  || mongoose.model('SellerShippingSetup', sellerShippingSetupSchema);
