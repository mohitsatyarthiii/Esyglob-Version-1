import mongoose from 'mongoose';
import crypto from 'crypto';

const savedResearchReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roleContext: {
      type: String,
      enum: ['buyer', 'seller', 'general'],
      default: 'general',
      index: true,
    },
    reportType: {
      type: String,
      enum: ['product_rd', 'country_rd', 'opportunity_finder'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      default: '',
    },
    country: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    query: {
      type: String,
      trim: true,
      default: '',
    },
    queryHash: {
      type: String,
      default: '',
      index: true,
    },
    reportVersion: {
      type: String,
      default: '1.0',
    },
    reportData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    pdfData: {
      type: Buffer,
      select: false,
    },
    pdfStatus: {
      type: String,
      enum: ['pending', 'ready', 'failed'],
      default: 'pending',
      index: true,
    },
    pdfGeneratedAt: Date,
    pdfError: {
      type: String,
      default: '',
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    lastOpenedAt: Date,
    shareToken: {
      type: String,
      default: () => crypto.randomBytes(24).toString('hex'),
      unique: true,
      sparse: true,
      select: false,
    },
    shareEnabled: {
      type: Boolean,
      default: false,
    },
    shareCreatedAt: Date,
    isBookmarked: {
      type: Boolean,
      default: false,
      index: true,
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

savedResearchReportSchema.index({ userId: 1, status: 1, updatedAt: -1 });
savedResearchReportSchema.index({ userId: 1, reportType: 1, updatedAt: -1 });
savedResearchReportSchema.index({ userId: 1, queryHash: 1, status: 1, createdAt: -1 });
savedResearchReportSchema.index({ title: 'text', productName: 'text', country: 'text', query: 'text' });

export default mongoose.models.SavedResearchReport || mongoose.model('SavedResearchReport', savedResearchReportSchema);
