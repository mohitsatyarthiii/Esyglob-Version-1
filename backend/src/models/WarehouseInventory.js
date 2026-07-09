// models/WarehouseInventory.js
import mongoose from 'mongoose';

const warehouseInventorySchema = new mongoose.Schema({
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
  sku: {
    type: String,
    required: true
  },
  
  // Product Details
  productName: String,
  productDescription: String,
  category: String,
  hsCode: String,
  
  // Inventory
  totalQuantity: { type: Number, default: 0 },
  availableQuantity: { type: Number, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  damagedQuantity: { type: Number, default: 0 },
  
  // Storage
  storageLocation: String, // Aisle-Rack-Shelf
  storageType: { type: String, enum: ['standard', 'climate_controlled', 'cold_storage', 'hazardous', 'high_value'] },
  
  // Dimensions
  unitWeight: Number, // kg
  unitLength: Number, // cm
  unitWidth: Number,
  unitHeight: Number,
  
  // Value
  unitValue: Number,
  currency: { type: String, default: 'USD' },
  
  // Tracking
  batchNumber: String,
  expiryDate: Date,
  manufacturingDate: Date,
  
  // Status
  status: { type: String, enum: ['active', 'quarantine', 'expired', 'disposed'], default: 'active' },
  
  // Reorder
  reorderPoint: Number,
  reorderQuantity: Number,
  
  // Images
  images: [String],
  
  // Notes
  notes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

warehouseInventorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.WarehouseInventory || mongoose.model('WarehouseInventory', warehouseInventorySchema);