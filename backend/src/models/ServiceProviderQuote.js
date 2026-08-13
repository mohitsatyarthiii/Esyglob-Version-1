import mongoose from 'mongoose';

const serviceProviderQuoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  serviceKey: { type: String, required: true, default: 'shipping' },
  routeType: { type: String, enum: ['domestic', 'international'], required: true },
  providerKey: { type: String, enum: ['dhl', 'fedex', 'shiprocket', 'delhivery'], required: true },
  providerName: { type: String, required: true },
  serviceCode: { type: String, required: true },
  serviceName: { type: String, required: true },
  serviceType: String,
  currency: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  estimatedDeliveryAt: Date,
  estimatedDeliveryText: String,
  trackingAvailable: { type: Boolean, default: true },
  insuranceAvailable: { type: Boolean, default: false },
  pickupAvailable: { type: Boolean, default: false },
  bookingAvailable: { type: Boolean, default: true },
  pickupLocation: String,
  deliveryType: String,
  features: [String],
  recommended: { type: Boolean, default: false },
  fastest: { type: Boolean, default: false },
  bestPrice: { type: Boolean, default: false },
  requestSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  providerPayload: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: Date,
}, { timestamps: true });

serviceProviderQuoteSchema.index({ userId: 1, _id: 1, expiresAt: 1 });

export default mongoose.models.ServiceProviderQuote
  || mongoose.model('ServiceProviderQuote', serviceProviderQuoteSchema);
