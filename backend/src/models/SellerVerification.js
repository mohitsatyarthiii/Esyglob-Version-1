import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'gst_certificate',
      'pan_card',
      'aadhaar_card',
      'business_registration',
      'incorporation_certificate',
      'address_proof',
      'utility_bill',
      'bank_statement',
      'import_export_code',
      'msme_certificate',
      'government_id',
      'government_id_front',
      'government_id_back',
      'passport',
      'driving_license',
      'national_identity_card',
      'director_id',
      'factory_address_proof',
      'office_address_proof',
      'warehouse_address_proof',
      'lease_agreement',
      'factory_image',
      'factory_video',
      'production_line_image',
      'machinery_image',
      'certification',
      'cin_document',
      'partnership_deed',
      'llp_agreement',
      'trade_license',
      'shop_license',
      'professional_tax',
      'ad_code',
      'rcmc',
      'dgft_registration',
      'lut_document',
      'import_license',
      'export_license',
      'customs_registration',
      'factory_license',
      'warehouse_image',
      'office_image',
      'fire_safety_certificate',
      'pollution_certificate',
      'cancelled_cheque',
      'bank_certificate',
      'quality_certificate',
      'service_license',
      'service_document',
      'other',
    ],
  },
  name: {
    type: String,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'verified', 'rejected', 'expired', 'needs_update', 'archived'],
    default: 'pending',
  },
  rejectionReason: String,
  reviewerNotes: String,
  issueDate: Date,
  expiryDate: Date,
  version: { type: Number, default: 1, min: 1 },
  reuploadCount: { type: Number, default: 0, min: 0 },
  supersedesDocumentId: mongoose.Schema.Types.ObjectId,
  archivedAt: Date,
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  verifiedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  storageProvider: String,
  storageKey: String,
  mimeType: String,
  size: Number,
  checksum: String,
  expiresAt: Date,
});

const sellerVerificationSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    
    // Verification Status
    status: {
      type: String,
      enum: [
        'pending',
        'draft',
        'submitted',
        'document_submitted',
        'document_review',
        'info_requested',
        'additional_information_required',
        'factory_inspection_scheduled',
        'manual_verification',
        'under_review',
        'approved',
        'rejected',
        'suspended',
        'expired',
        'reverification_required',
      ],
      default: 'pending',
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
      
    },
    completedFields: [{
      key: String,
      label: String,
    }],
    remainingFields: [{
      key: String,
      label: String,
    }],
    completedFieldCount: {
      type: Number,
      default: 0,
    },
    totalFieldCount: {
      type: Number,
      default: 0,
    },
    
    // Documents
    documents: [documentSchema],
    
    // Verification Details
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    
    // Admin Notes
    adminNotes: {
      type: String,
    },
    rejectionReason: {
      type: String,
    },
    
    // Verification Score (0-100)
    verificationScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    verificationLevel: {
      type: Number,
      min: 0,
      max: 6,
      default: 0,
      index: true,
    },
    verifiedAt: Date,
    verificationExpiresAt: Date,
    inspectionScheduledAt: Date,
    inspectionCompletedAt: Date,
    assessmentReportUrl: String,
    publicVerificationVideoUrl: String,
    currentStep: { type: Number, min: 0, max: 7, default: 0 },
    completedSteps: [{ type: Number, min: 0, max: 7 }],
    rejectedSteps: [{ type: Number, min: 0, max: 7 }],
    stepData: { type: mongoose.Schema.Types.Mixed, default: {} },
    businessScore: { type: Number, min: 0, max: 100, default: 0 },
    tradeReadinessScore: { type: Number, min: 0, max: 100, default: 0 },
    serviceReadinessScore: { type: Number, min: 0, max: 100, default: 0 },
    overallTrustScore: { type: Number, min: 0, max: 100, default: 0 },
    lastSavedAt: Date,
    checks: [
      {
        type: {
          type: String,
          enum: [
            'company',
            'identity',
            'gst',
            'pan',
            'iec',
            'msme',
            'address',
            'bank',
            'factory',
            'certification',
          ],
        },
        status: {
          type: String,
          enum: ['pending', 'in_progress', 'passed', 'failed', 'not_applicable'],
          default: 'pending',
        },
        provider: String,
        referenceId: String,
        checkedAt: Date,
        checkedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        notes: String,
        response: mongoose.Schema.Types.Mixed,
      },
    ],
    informationRequests: [
      {
        message: String,
        requestedAt: Date,
        requestedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        resolvedAt: Date,
      },
    ],
    
    // Priority
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
sellerVerificationSchema.index({ status: 1 });
sellerVerificationSchema.index({ onboardingCompleted: 1 });
sellerVerificationSchema.index({ submittedAt: -1 });
sellerVerificationSchema.index({ priority: 1 });
sellerVerificationSchema.index({
  status: 'text',
  priority: 'text',
  adminNotes: 'text',
  rejectionReason: 'text',
  'documents.name': 'text',
  'documents.type': 'text',
});

const SellerVerification = mongoose.models.SellerVerification || 
  mongoose.model('SellerVerification', sellerVerificationSchema);

export default SellerVerification;
