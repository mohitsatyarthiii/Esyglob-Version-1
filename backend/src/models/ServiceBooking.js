import mongoose from 'mongoose';

const serviceBookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, unique: true, required: true, index: true },
  serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  providerKey: { type: String, required: true, index: true },
  providerName: String,
  serviceCode: String,
  serviceName: String,
  routeType: { type: String, enum: ['domestic', 'international'] },
  providerReference: { type: String, index: true },
  providerShipmentId: { type: String, index: true },
  pickupRequestId: { type: String, index: true },
  trackingNumber: { type: String, index: true },
  trackingUrl: String,
  labelUrl: String,
  status: {
    type: String,
    enum: ['payment_pending', 'booking_pending', 'confirmed', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'failed'],
    default: 'payment_pending',
    index: true,
  },
  eta: Date,
  pricing: mongoose.Schema.Types.Mixed,
  pickup: mongoose.Schema.Types.Mixed,
  destination: mongoose.Schema.Types.Mixed,
  shipment: mongoose.Schema.Types.Mixed,
  providerPayload: mongoose.Schema.Types.Mixed,
  bookingLockUntil: Date,
  lastProviderSyncAt: Date,
  lastProviderError: String,
  timeline: [{
    status: String,
    message: String,
    location: String,
    occurredAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

serviceBookingSchema.pre('validate', function setBookingNumber() {
  if (!this.bookingNumber) {
    this.bookingNumber = `ESY-SVC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }
});

export default mongoose.models.ServiceBooking
  || mongoose.model('ServiceBooking', serviceBookingSchema);
