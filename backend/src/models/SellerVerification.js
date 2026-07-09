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
      'director_id',
      'factory_address_proof',
      'factory_image',
      'factory_video',
      'production_line_image',
      'machinery_image',
      'certification',
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
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectionReason: String,
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
        'document_submitted',
        'document_review',
        'info_requested',
        'manual_verification',
        'under_review',
        'approved',
        'rejected',
        'suspended',
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
      max: 4,
      default: 0,
      index: true,
    },
    verifiedAt: Date,
    verificationExpiresAt: Date,
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
