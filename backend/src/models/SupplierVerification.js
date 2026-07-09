// models/SupplierVerification.js
import mongoose from 'mongoose';

const supplierVerificationSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  applicationNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  level: {
    type: String,
    enum: ['basic', 'verified', 'premium'],
    default: 'basic'
  },
  
  status: {
    type: String,
    enum: ['draft', 'submitted', 'document_review', 'factory_audit', 'approved', 'rejected', 'expired', 'suspended'],
    default: 'draft'
  },
  
  // Company Documents
  documents: [{
    type: {
      type: String,
      enum: ['business_license', 'tax_registration', 'company_registration', 'bank_details', 'director_id', 'address_proof', 'iso_certification', 'export_license', 'other']
    },
    name: String,
    url: String,
    status: { type: String, enum: ['pending', 'uploaded', 'verified', 'rejected'], default: 'pending' },
    verifiedAt: Date,
    rejectionReason: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Company Info
  companyName: String,
  registrationNumber: String,
  taxId: String,
  yearEstablished: Number,
  legalRepresentative: {
    name: String,
    designation: String,
    idType: String,
    idNumber: String,
    idProof: String
  },
  
  // Factory Audit (Premium)
  factoryAudit: {
    scheduledDate: Date,
    completedDate: Date,
    auditorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    auditorName: String,
    auditReportUrl: String,
    findings: {
      productionCapacity: { type: String, enum: ['exceeds', 'meets', 'below'] },
      qualitySystems: { type: String, enum: ['excellent', 'good', 'average', 'poor'] },
      equipmentCondition: { type: String, enum: ['excellent', 'good', 'average', 'poor'] },
      workforceSkill: { type: String, enum: ['excellent', 'good', 'average', 'poor'] },
      compliance: { type: String, enum: ['compliant', 'non_compliant'] },
      overallRating: { type: Number, min: 1, max: 5 }
    },
    photos: [String]
  },
  
  // Certifications
  certifications: [{
    name: String,
    issuingBody: String,
    certificateNumber: String,
    issueDate: Date,
    expiryDate: Date,
    certificateUrl: String,
    verified: { type: Boolean, default: false }
  }],
  
  // Verification Timeline
  submittedAt: Date,
  documentVerifiedAt: Date,
  approvedAt: Date,
  rejectedAt: Date,
  rejectionReason: String,
  
  // Validity
  validFrom: Date,
  validUntil: Date,
  renewalReminderSent: { type: Boolean, default: false },
  
  // Badge
  badge: {
    type: { type: String, enum: ['unverified', 'verified', 'premium'], default: 'unverified' },
    displayOnProfile: { type: Boolean, default: true }
  },
  
  // Fees
  verificationFee: Number,
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  
  // Notes
  internalNotes: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

supplierVerificationSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await mongoose.model('SupplierVerification').countDocuments();
    this.applicationNumber = `VRF${String(count + 1).padStart(8, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.SupplierVerification || mongoose.model('SupplierVerification', supplierVerificationSchema);