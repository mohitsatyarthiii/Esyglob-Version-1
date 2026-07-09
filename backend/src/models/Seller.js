import mongoose from 'mongoose';
import { SELLER_STATUS } from '../lib/constants.js';

const sellerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    
    // Company Information
    companyName: {
      type: String,
      trim: true,
    },
    companyType: {
      type: String,
      enum: ['manufacturer', 'wholesaler', 'distributor', 'trader', 'exporter', 'other'],
    },
    companyDescription: {
      type: String,
      maxlength: 2000,
    },
    companyLogo: {
      type: String,
      trim: true,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    companyWebsite: {
      type: String,
      trim: true,
    },
    yearEstablished: {
      type: Number,
    },
    employeeCount: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
    },
    
    // Business Details
    gstNumber: {
      type: String,
      trim: true,
      index: true,
    },
    panNumber: {
      type: String,
      trim: true,
      index: true,
    },
    aadhaarNumber: {
      type: String,
      trim: true,
    },
    businessRegistrationNumber: {
      type: String,
      trim: true,
    },
    importExportCode: {
      type: String,
      trim: true,
    },
    
    // Contact Information
    businessEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    businessPhone: {
      type: String,
      trim: true,
    },
    
    // Address
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },
    
    // Bank Details
    bankDetails: {
      accountHolderName: String,
      accountNumber: String,
      ifscCode: String,
      bankName: String,
      branchName: String,
    },
    shippingInfo: {
      originPort: String,
      preferredCarriers: [String],
      exportCountries: [String],
      handlingTime: String,
    },
    
    // Verification Status
    verificationStatus: {
      type: String,
      enum: Object.values(SELLER_STATUS),
      default: SELLER_STATUS.PENDING,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationBadge: {
      type: String,
      enum: ['inactive', 'active', 'expired'],
      default: 'inactive',
    },
    verificationDate: {
      type: Date,
    },
    verificationLevel: {
      type: Number,
      min: 0,
      max: 4,
      default: 0,
      index: true,
    },
    verificationExpiresAt: Date,
    verificationNotes: {
      type: String,
    },
    isTrustedSeller: {
      type: Boolean,
      default: false,
    },
    trustedSellerBadge: {
      type: String,
      enum: ['inactive', 'active'],
      default: 'inactive',
    },
    trustedSellerGrantedAt: Date,
    trustedSellerGrantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    trustedSellerNotes: {
      type: String,
      trim: true,
    },
    onboardingDraftSavedAt: Date,
    onboardingSubmittedAt: Date,
    
    // Subscription
    subscriptionPlan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'inactive', 'expired', 'cancelled'],
      default: 'inactive',
    },
    subscriptionExpiryDate: {
      type: Date,
    },
    
    // Metrics
    totalProducts: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    responseRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    averageResponseTimeHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    onTimeDeliveryRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    yearsInBusiness: Number,
    annualRevenueRange: String,
    monthlyCapacity: String,
    exportMarkets: [String],
    productCategories: [String],
    tradeHistorySummary: {
      completedOrders: { type: Number, default: 0 },
      repeatBuyerRate: { type: Number, default: 0 },
      countriesServed: { type: Number, default: 0 },
    },
    
    // Trust Score (0-100)
    trustScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
    suspensionReason: {
      type: String,
    },
    
    // Certifications
    certifications: [{
      name: String,
      issuer: String,
      validUntil: Date,
      documentUrl: String,
    }],
    
    // Business Hours
    businessHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
sellerSchema.index({ verificationStatus: 1 });
sellerSchema.index({ isVerified: 1 });
sellerSchema.index({ isTrustedSeller: 1 });
sellerSchema.index({ subscriptionPlan: 1 });
sellerSchema.index({ trustScore: -1 });
sellerSchema.index({ 'address.country': 1, 'address.state': 1 });
sellerSchema.index({ isActive: 1, isVerified: 1 });
sellerSchema.index({ userId: 1, isActive: 1 });
sellerSchema.index({ isActive: 1, isSuspended: 1, isVerified: -1, trustScore: -1, rating: -1 });
sellerSchema.index({ isActive: 1, isTrustedSeller: -1, isVerified: -1, trustScore: -1, rating: -1 });
sellerSchema.index({ isActive: 1, isVerified: 1, isTrustedSeller: -1, verificationLevel: -1, trustScore: -1, rating: -1 });
sellerSchema.index({ isActive: 1, isVerified: 1, companyType: 1, rating: -1, createdAt: -1 });
sellerSchema.index({ isActive: 1, isVerified: 1, 'address.country': 1, rating: -1 });
sellerSchema.index({ companyName: 'text', companyDescription: 'text', companyType: 'text', productCategories: 'text' });

// Methods
sellerSchema.methods.updateVerificationBadge = function () {
  if (this.isVerified && this.subscriptionStatus === 'active') {
    this.verificationBadge = 'active';
  } else if (this.isVerified && this.subscriptionStatus !== 'active') {
    this.verificationBadge = 'expired';
  } else {
    this.verificationBadge = 'inactive';
  }
};

const Seller = mongoose.models.Seller || mongoose.model('Seller', sellerSchema);

export default Seller;
