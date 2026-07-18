import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
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
    // ✅ NEW: Denormalized flag — eliminates the expensive $in seller lookup
    isVerifiedSeller: {
      type: Boolean,
      default: false,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      index: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcategory',
      index: true,
    },
    primaryHsCodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HSCode', index: true },
    hsCodeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HSCode' }],
    hsCodes: [{ code: { type: String, trim: true }, description: String, revision: String, confidence: { type: Number, min: 0, max: 1 }, source: { type: String, enum: ['manual', 'ai_recommended', 'dataset_mapping', 'verified'], default: 'manual' }, isPrimary: { type: Boolean, default: false } }],
    name: {
      type: String,
      trim: true,
      default: 'Untitled product draft',
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    category: {
      type: String,
      trim: true,
      default: '',
    },
    subcategory: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    priceTiers: [
      {
        minimumQuantity: { type: Number, min: 1 },
        maximumQuantity: { type: Number, min: 1 },
        unitPrice: { type: Number, min: 0 },
      },
    ],
    samplePrice: {
      type: Number,
      default: null,
    },
    minimumOrderQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    unit: {
      type: String,
      enum: ['piece', 'kg', 'gram', 'metric_ton', 'litre', 'millilitre', 'meter', 'centimeter', 'roll', 'pack', 'box', 'bottle', 'carton', 'bag', 'set'],
      default: 'piece',
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    countryOfOrigin: {
      type: String,
      trim: true,
    },
    stockQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    images: [
      {
        type: String,
      },
    ],
    videos: [
      {
        url: String,
        thumbnailUrl: String,
        title: String,
      },
    ],
    variants: [
      {
        sku: String,
        name: String,
        attributes: mongoose.Schema.Types.Mixed,
        price: Number,
        minimumOrderQuantity: Number,
        stockQuantity: Number,
        images: [String],
        isActive: { type: Boolean, default: true },
      },
    ],
    specifications: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    leadTime: {
      value: { type: Number, min: 0 },
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months'],
        default: 'days',
      },
    },
    deliveryTime: {
      value: { type: Number, min: 0 },
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months'],
        default: 'days',
      },
    },
    manufacturingDetails: {
      processType: String,
      capacity: String,
      automationLevel: String,
    },
    packaging: {
      type: { type: String },
      weight: String,
      dimensions: String,
      unitsPerPackage: Number,
      customizationAvailable: Boolean,
    },
    certifications: [
      {
        name: String,
        issuer: String,
        certificateNumber: String,
        documentUrl: String,
        validUntil: Date,
      },
    ],
    paymentTerms: {
      type: String,
      enum: ['prepayment', 'partial_prepayment', 'bank_transfer', 'credit', 'negotiable'],
      default: 'negotiable',
    },
    tradeTerms: [String],
    shipping: {
      available: { type: Boolean, default: false },
      methods: [String],
      originPort: String,
      countries: [String],
      estimateText: String,
    },
    warranty: String,
    warrantyPeriod: String,
    sampleAvailable: {
      type: Boolean,
      default: false,
    },
    orderType: {
      type: String,
      enum: ['inquiry_only', 'rfq_only', 'direct_order_enabled'],
      default: 'inquiry_only',
      index: true,
    },
    directOrderEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    productType: String,
    status: {
      type: String,
      enum: ['draft', 'published', 'pending_review', 'rejected', 'active', 'paused'],
      default: 'draft',
    },
    statusReason: String,
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    tags: [
      {
        type: String,
      },
    ],
    bulkImportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BulkProductImport',
      index: true,
    },
    importRowNumber: Number,
  },
  {
    timestamps: true,
  }
);

// ✅ NEW: Compound indexes matching actual query patterns
// Primary public listing: filter by verified + status + category, sort by createdAt
productSchema.index(
  { isVerifiedSeller: 1, status: 1, category: 1, createdAt: -1 },
  { name: 'idx_public_listing' }
);

// Subcategory-filtered public listing
productSchema.index(
  { isVerifiedSeller: 1, status: 1, subcategory: 1, createdAt: -1 },
  { name: 'idx_public_listing_subcat' }
);

// Seller dashboard queries
productSchema.index(
  { sellerId: 1, status: 1, createdAt: -1 },
  { name: 'idx_seller_dashboard' }
);

// Existing indexes — keep them
productSchema.index({ sellerId: 1, createdAt: -1 });
productSchema.index({ userId: 1, createdAt: -1 });
productSchema.index({ status: 1, sellerId: 1, createdAt: -1 });
productSchema.index({ status: 1, category: 1, subcategory: 1, createdAt: -1 });
productSchema.index({ status: 1, categoryId: 1, subcategoryId: 1, createdAt: -1 });
productSchema.index({ status: 1, categoryId: 1, totalOrders: -1, averageRating: -1, createdAt: -1 });
productSchema.index({ status: 1, subcategoryId: 1, totalOrders: -1, averageRating: -1, createdAt: -1 });
productSchema.index({ sellerId: 1, status: 1, totalOrders: -1, averageRating: -1, createdAt: -1 });
productSchema.index({ status: 1, category: 1, price: 1, minimumOrderQuantity: 1 });
productSchema.index({ status: 1, categoryId: 1, price: 1, averageRating: -1 });
productSchema.index({ status: 1, subcategoryId: 1, price: 1, averageRating: -1 });
productSchema.index({ name: 'text', category: 'text', subcategory: 'text', description: 'text' });
productSchema.index({ averageRating: -1 });
productSchema.index({ status: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, averageRating: -1, totalOrders: -1 });
productSchema.index({ status: 1, directOrderEnabled: 1, orderType: 1 });
productSchema.index({ status: 1, 'priceTiers.minimumQuantity': 1 });
productSchema.index({ bulkImportId: 1, importRowNumber: 1 });
productSchema.index({ hsCodeIds: 1, status: 1 });
productSchema.index({ 'hsCodes.code': 1, status: 1 });
productSchema.index({ slug: 1 }, { sparse: true });

function slugify(value) {
  return String(value || 'product')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product';
}

productSchema.pre('validate', function setProductSlug() {
  if (!this.slug && this.name) {
    this.slug = `${slugify(this.name)}-${String(this._id).slice(-6)}`;
  }
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

export default Product;
