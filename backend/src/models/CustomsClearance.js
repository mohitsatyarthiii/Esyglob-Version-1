// models/CustomsClearance.js
import mongoose from 'mongoose';

const customsClearanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clearanceNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  type: {
    type: String,
    enum: ['import', 'export'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['draft', 'submitted', 'documents_uploaded', 'under_review', 'duties_calculated', 'duties_paid', 'filed', 'cleared', 'held', 'released', 'cancelled'],
    default: 'draft'
  },
  
  // Shipment Details
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingOrder' },
  carrier: String,
  trackingNumber: String,
  vesselName: String,
  voyageNumber: String,
  arrivalDate: Date,
  
  // Origin/Destination
  originCountry: String,
  destinationCountry: String,
  portOfLoading: String,
  portOfDischarge: String,
  
  // Product Details
  products: [{
    name: String,
    description: String,
    hsCode: String,
    quantity: Number,
    unit: String,
    unitValue: Number,
    totalValue: Number,
    originCountry: String,
    dutyRate: Number,
    calculatedDuty: Number
  }],
  
  // Financials
  cifValue: Number, // Cost + Insurance + Freight
  fobValue: Number, // Free on Board
  
  // Duties & Taxes
  basicCustomsDuty: Number,
  additionalDuty: Number,
  socialWelfareSurcharge: Number,
  igst: Number,
  compensationCess: Number,
  antiDumpingDuty: Number,
  totalDuties: Number,
  
  // Broker
  brokerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  brokerName: String,
  brokerCompany: String,
  
  // Documents
  documents: [{
    type: { 
      type: String, 
      enum: ['bill_of_lading', 'air_waybill', 'commercial_invoice', 'packing_list', 'certificate_of_origin', 'insurance', 'import_license', 'gst_invoice', 'bill_of_entry', 'customs_declaration', 'other'] 
    },
    name: String,
    url: String,
    status: { type: String, enum: ['pending', 'uploaded', 'verified', 'rejected'], default: 'pending' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Customs Entry
  billOfEntryNumber: String,
  billOfEntryDate: Date,
  customsStation: String,
  assessmentDate: Date,
  clearanceDate: Date,
  
  // Compliance
  complianceStatus: { type: String, enum: ['compliant', 'non_compliant', 'review_required'] },
  holdReason: String,
  
  // Payment
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  paymentReference: String,
  paymentDate: Date,
  
  // Notes
  notes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

customsClearanceSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('CustomsClearance').countDocuments();
    this.clearanceNumber = `CUS${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.CustomsClearance || mongoose.model('CustomsClearance', customsClearanceSchema);