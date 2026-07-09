// models/TaxCalculation.js
import mongoose from 'mongoose';

const taxCalculationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Calculation Type
  type: {
    type: String,
    enum: ['import_duty', 'gst', 'export_benefits'],
    required: true
  },
  
  // Input Parameters
  inputs: {
    // Import Duty
    productValue: Number,
    currency: { type: String, default: 'USD' },
    originCountry: String,
    destinationCountry: String,
    hsCode: String,
    productCategory: String,
    shippingCost: Number,
    insuranceCost: Number,
    quantity: Number,
    
    // GST
    transactionType: { type: String, enum: ['interstate', 'intrastate'] },
    gstRate: Number,
    includesGst: Boolean,
    
    // Export
    exportType: String,
    isGstRegistered: Boolean
  },
  
  // Calculation Results
  results: {
    // Import Duty
    cifValue: Number,
    assessableValue: Number,
    basicCustomsDuty: Number,
    socialWelfareSurcharge: Number,
    igst: Number,
    compensationCess: Number,
    totalDuty: Number,
    totalLandedCost: Number,
    effectiveDutyRate: Number,
    
    // GST
    taxableValue: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    totalTax: Number,
    totalAmount: Number,
    
    // Export Benefits
    dutyDrawback: Number,
    rodtepBenefit: Number,
    gstRefund: Number,
    totalBenefits: Number
  },
  
  // Metadata
  saved: { type: Boolean, default: false },
  name: String,
  notes: String,
  
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.TaxCalculation || mongoose.model('TaxCalculation', taxCalculationSchema);