// models/QualityInspection.js
import mongoose from 'mongoose';

const qualityInspectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  inspectionNumber: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'inspector_assigned', 'scheduled', 'in_progress', 'completed', 'report_ready', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  
  type: {
    type: String,
    enum: ['pre_shipment', 'during_production', 'container_loading', 'lab_testing'],
    required: true
  },
  
  // Supplier/Factory Details
  supplierName: String,
  factoryName: String,
  factoryAddress: {
    address: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  contactPerson: String,
  contactPhone: String,
  contactEmail: String,
  
  // Product Details
  products: [{
    name: String,
    description: String,
    quantity: Number,
    unit: String,
    specifications: String,
    hsCode: String,
    samplePhotos: [String]
  }],
  
  totalQuantity: Number,
  
  // Inspection Details
  requestedDate: Date,
  scheduledDate: Date,
  completedDate: Date,
  
  // Inspector
  inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  inspectorName: String,
  inspectorCompany: String,
  
  // Inspection Standard
  standard: { type: String, default: 'AQL 2.5' }, // AQL Level
  specialRequirements: String,
  
  // Results
  result: { type: String, enum: ['pass', 'fail', 'conditional'] },
  defectRate: Number,
  criticalDefects: Number,
  majorDefects: Number,
  minorDefects: Number,
  
  // Report
  reportUrl: String,
  reportPhotos: [String],
  reportSummary: String,
  reportDate: Date,
  
  // Costs
  inspectionFee: Number,
  travelExpenses: Number,
  totalCost: Number,
  currency: { type: String, default: 'USD' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  
  // Notes
  notes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

qualityInspectionSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('QualityInspection').countDocuments();
    this.inspectionNumber = `QIN${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.QualityInspection || mongoose.model('QualityInspection', qualityInspectionSchema);