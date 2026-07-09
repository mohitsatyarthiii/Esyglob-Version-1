import mongoose from 'mongoose';

const recentlyViewedSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    viewedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

recentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true });
recentlyViewedSchema.index({ userId: 1, viewedAt: -1 });

export default mongoose.models.RecentlyViewed ||
  mongoose.model('RecentlyViewed', recentlyViewedSchema);
