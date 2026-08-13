import mongoose from 'mongoose';
import { SELLER_STATUS } from '../lib/constants.js';
import { mediaIntegrityPlugin } from '../lib/media-integrity.js';

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
    coverImage: {
      type: String,
      trim: true,
    },
    companyPhotos: {
      type: [String],
      default: [],
    },
    companyVideos: {
      type: [String],
      default: [],
    },
    brochures: {
      type: [String],
      default: [],
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
    languages: {
      type: [String],
      default: [],
    },
    socialLinks: {
      linkedin: String,
      facebook: String,
      instagram: String,
      youtube: String,
    },
    teamContacts: [{
      name: String,
      designation: String,
      email: String,
      phone: String,
    }],
    
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
      shippingSupport: [String],
    },
    shippingReady: { type: Boolean, default: false, index: true },
    shippingReadiness: { type: String, enum: ['invalid', 'pending', 'partial', 'ready', 'failed'], default: 'pending', index: true },
    shippingSetupUpdatedAt: Date,
    tradeCapabilities: {
      oem: { type: Boolean, default: false },
      odm: { type: Boolean, default: false },
      privateLabel: { type: Boolean, default: false },
      minimumOrderQuantity: String,
      productionLeadTime: String,
      qualityAssurance: String,
      rdCapability: String,
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
      max: 6,
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
    badges: {
      verifiedSeller: { type: Boolean, default: false },
      premiumSeller: { type: Boolean, default: false },
      trustedSupplier: { type: Boolean, default: false },
      goldSupplier: { type: Boolean, default: false },
      topRated: { type: Boolean, default: false },
      manufacturer: { type: Boolean, default: false },
      exporter: { type: Boolean, default: false },
      fastResponse: { type: Boolean, default: false },
    },
    onboardingDraftSavedAt: Date,
    onboardingSubmittedAt: Date,
    
    // Subscription
    subscriptionPlan: {
      type: String,
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
    productSubcategories: [String],
    industries: [String],
    mainProducts: [String],
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
      status: {
        type: String,
        enum: ['unverified', 'pending', 'verified', 'rejected'],
        default: 'unverified',
      },
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
sellerSchema.plugin(mediaIntegrityPlugin, {
  entity: 'sellers',
  paths: ['companyLogo', 'coverImage', 'companyPhotos', 'companyVideos', 'brochures', 'logoUrl', 'logo', 'certifications.documentUrl'],
});

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
