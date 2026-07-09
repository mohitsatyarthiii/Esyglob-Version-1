// models/Review.js
import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // Ratings
  rating: {
    overall: { type: Number, min: 1, max: 5, required: true },
    quality: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
    shipping: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 }
  },
  
  // Review Content
  title: String,
  comment: String,
  pros: [String],
  cons: [String],
  
  // Images
  images: [String],
  
  // Verification
  verifiedPurchase: { type: Boolean, default: false },
  
  // Helpful Votes
  helpfulCount: { type: Number, default: 0 },
  notHelpfulCount: { type: Number, default: 0 },
  
  // Seller Response
  sellerResponse: {
    comment: String,
    respondedAt: Date
  },
  
  // Status
  status: { type: String, enum: ['published', 'hidden', 'reported', 'removed'], default: 'published' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

reviewSchema.index({ sellerId: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ title: 'text', comment: 'text', pros: 'text', cons: 'text', status: 'text' });

export default mongoose.models.Review || mongoose.model('Review', reviewSchema);
