import mongoose from 'mongoose';

const importRowSchema = new mongoose.Schema(
  {
    rowNumber: Number,
    raw: mongoose.Schema.Types.Mixed,
    data: mongoose.Schema.Types.Mixed,
    errors: [String],
    warnings: [String],
    status: {
      type: String,
      enum: ['valid', 'invalid', 'imported', 'failed'],
      default: 'invalid',
    },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    failedReason: String,
  },
  { _id: false, suppressReservedKeysWarning: true }
);

const bulkProductImportSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fileName: String,
    fileType: String,
    importStatus: {
      type: String,
      enum: ['validated', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'],
      default: 'validated',
      index: true,
    },
    requestedProductStatus: {
      type: String,
      enum: ['draft', 'active', 'paused'],
      default: 'draft',
    },
    totals: {
      totalRows: { type: Number, default: 0 },
      validRows: { type: Number, default: 0 },
      invalidRows: { type: Number, default: 0 },
      importedRows: { type: Number, default: 0 },
      failedRows: { type: Number, default: 0 },
      warningRows: { type: Number, default: 0 },
    },
    progress: {
      totalProducts: { type: Number, default: 0 },
      importedProducts: { type: Number, default: 0 },
      failedProducts: { type: Number, default: 0 },
      remainingProducts: { type: Number, default: 0 },
    },
    rows: [importRowSchema],
    errorReport: [mongoose.Schema.Types.Mixed],
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

bulkProductImportSchema.index({ sellerId: 1, createdAt: -1 });
bulkProductImportSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.BulkProductImport ||
  mongoose.model('BulkProductImport', bulkProductImportSchema);
