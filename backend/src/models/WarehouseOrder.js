// models/WarehouseOrder.js
import mongoose from 'mongoose';

const warehouseOrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  warehouseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  type: {
    type: String,
    enum: ['inbound', 'outbound', 'return', 'transfer'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'processing', 'picking', 'packing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  
  // Order Items
  items: [{
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseInventory' },
    sku: String,
    productName: String,
    quantity: Number,
    pickedQuantity: { type: Number, default: 0 }
  }],
  
  // Shipping Details
  shippingAddress: {
    name: String,
    company: String,
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    phone: String
  },
  
  carrier: String,
  trackingNumber: String,
  shippingCost: Number,
  
  // Costs
  pickPackFee: Number,
  shippingFee: Number,
  additionalServices: Number,
  totalCost: Number,
  currency: { type: String, default: 'USD' },
  
  // Documents
  documents: [{
    type: String,
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Notes
  notes: String,
  specialInstructions: String,
  
  // Timestamps
  orderDate: { type: Date, default: Date.now },
  processedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

warehouseOrderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('WarehouseOrder').countDocuments();
    this.orderNumber = `WHO${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.WarehouseOrder || mongoose.model('WarehouseOrder', warehouseOrderSchema);