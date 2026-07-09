import mongoose from 'mongoose';

const shipmentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    provider: { type: String, trim: true, default: 'manual', index: true },
    courierName: String,
    providerShipmentId: String,
    trackingNumber: { type: String, index: true },
    serviceLevel: String,
    status: {
      type: String,
      enum: ['pending', 'label_created', 'pickup_scheduled', 'picked_up', 'warehouse_processing', 'in_transit', 'custom_clearance', 'customs', 'out_for_delivery', 'delivered', 'exception', 'cancelled', 'returned'],
      default: 'pending',
      index: true,
    },
    pickupDate: Date,
    estimatedDeliveryAt: Date,
    deliveredAt: Date,
    actualDeliveryAt: Date,
    packages: [{ weight: Number, length: Number, width: Number, height: Number, unit: String }],
    events: [{ status: String, description: String, location: String, occurredAt: Date }],
    documents: [{ type: String, label: String, url: String, status: String, uploadedAt: Date }],
    sellerAddress: mongoose.Schema.Types.Mixed,
    buyerAddress: mongoose.Schema.Types.Mixed,
    cost: { type: Number, default: 0 },
    insuranceStatus: { type: String, default: 'not_applicable' },
    warehouseStatus: { type: String, default: 'pending' },
    customsStatus: { type: String, default: 'not_applicable' },
    providerPayload: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

shipmentSchema.index({ orderId: 1, createdAt: -1 });
shipmentSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
shipmentSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
shipmentSchema.index({ sellerUserId: 1, status: 1, createdAt: -1 });

export default mongoose.models.Shipment || mongoose.model('Shipment', shipmentSchema);
