// models/Warehouse.js
import mongoose from 'mongoose';

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, required: true },
  
  // Location
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  
  // Details
  totalArea: Number, // m²
  usedArea: Number, // m²
  capacity: Number, // total units
  currentOccupancy: Number,
  
  // Services
  services: [{
    type: String,
    enum: ['storage', 'pick_pack', 'labeling', 'quality_check', 'returns', 'hazmat', 'cold_storage']
  }],
  
  // Storage Types
  storageTypes: [{
    type: String,
    enum: ['standard', 'climate_controlled', 'cold_storage', 'hazardous', 'high_value']
  }],
  
  // Rates
  storageRate: Number, // per m³ per month
  pickPackRate: Number, // per order
  receivingRate: Number, // per unit
  
  // Contact
  manager: String,
  phone: String,
  email: String,
  
  // Status
  status: { type: String, enum: ['active', 'maintenance', 'full', 'inactive'], default: 'active' },
  
  // Operating Hours
  operatingHours: {
    monday: { open: String, close: String },
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.models.Warehouse || mongoose.model('Warehouse', warehouseSchema);