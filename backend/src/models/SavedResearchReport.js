import mongoose from 'mongoose';

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
    reportData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
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
savedResearchReportSchema.index({ title: 'text', productName: 'text', country: 'text', query: 'text' });

export default mongoose.models.SavedResearchReport || mongoose.model('SavedResearchReport', savedResearchReportSchema);
