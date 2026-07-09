// models/ShippingOrder.js
import mongoose from 'mongoose';

const shippingOrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  type: {
    type: String,
    enum: ['ocean_fcl', 'ocean_lcl', 'air_freight', 'air_express', 'express_courier'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'quoted', 'booked', 'in_transit', 'customs_clearance', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'draft'
  },
  
  // Pickup Details
  pickup: {
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    contactName: String,
    contactPhone: String,
    pickupDate: Date
  },
  
  // Delivery Details
  delivery: {
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    contactName: String,
    contactPhone: String
  },
  
  // Package Details
  packages: [{
    description: String,
    quantity: Number,
    weight: Number, // kg
    length: Number, // cm
    width: Number,
    height: Number,
    value: Number,
    hsCode: String,
    isHazardous: { type: Boolean, default: false }
  }],
  
  totalWeight: Number,
  totalVolume: Number,
  declaredValue: Number,
  
  // Carrier & Tracking
  carrier: String,
  carrierService: String,
  trackingNumber: String,
  trackingUrl: String,
  estimatedDelivery: Date,
  actualDelivery: Date,
  
  // Costs
  shippingCost: Number,
  insuranceCost: Number,
  customsDuty: Number,
  handlingFee: Number,
  totalCost: Number,
  currency: { type: String, default: 'USD' },
  
  // Documents
  documents: [{
    type: { type: String, enum: ['commercial_invoice', 'packing_list', 'bill_of_lading', 'air_waybill', 'certificate_of_origin', 'insurance', 'customs_declaration', 'other'] },
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Insurance
  insurance: {
    isInsured: { type: Boolean, default: false },
    provider: String,
    policyNumber: String,
    coverage: Number
  },
  
  // Customs
  customs: {
    broker: String,
    clearanceStatus: { type: String, enum: ['pending', 'in_progress', 'cleared', 'held', 'rejected'] },
    dutiesPaid: Number,
    clearanceDate: Date
  },
  
  // Notes
  notes: String,
  specialInstructions: String,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Generate order number
shippingOrderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('ShippingOrder').countDocuments();
    this.orderNumber = `SHP${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.ShippingOrder || mongoose.model('ShippingOrder', shippingOrderSchema);