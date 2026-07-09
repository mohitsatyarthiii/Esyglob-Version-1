import ReviewRepository from '../repositories/review.repository.js';
import NotificationService from './notification.service.js';
import { createReviewSchema, toPositiveInt } from '../validators/review.validator.js';
import mongoose from 'mongoose';

class ReviewService {
  /**
   * Get reviews list with summary
   */
  static async getReviews(query = {}, session = null) {
    const {
      productId, sellerId, mine, sellerDashboard, limit: rawLimit,
    } = query;

    // Validate ObjectIds
    if (
      (productId && !mongoose.Types.ObjectId.isValid(productId)) ||
      (sellerId && !mongoose.Types.ObjectId.isValid(sellerId))
    ) {
      return {
        reviews: [],
        averageRating: 0,
        reviewCount: 0,
        breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };
    }

    const limit = toPositiveInt(rawLimit, 20, 60);
    const isMine = mine === 'true';
    const isSellerDashboard = sellerDashboard === 'true';

    if ((isMine || isSellerDashboard) && !session?.userId) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }

    const repoQuery = {};

    if (productId) repoQuery.productId = productId;
    if (sellerId) repoQuery.sellerId = sellerId;

    if (isMine) {
      repoQuery.userId = session.userId;
    }

    if (isSellerDashboard) {
      const seller = await ReviewRepository.findSellerByUserId(session.userId);
      if (!seller) {
        return {
          reviews: [],
          averageRating: 0,
          reviewCount: 0,
          breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        };
      }
      repoQuery.sellerId = seller._id;
    }

    return ReviewRepository.getReviews(repoQuery, limit);
  }

  /**
   * Create a new review
   */
  static async createReview(userId, roles, data) {
    // Validate
    const parsed = createReviewSchema.parse(data);

    if (!parsed.productId && !parsed.sellerId) {
      throw Object.assign(new Error('Select a product or supplier to review'), { statusCode: 422 });
    }

    // Validate ObjectIds
    if (
      (parsed.productId && !mongoose.Types.ObjectId.isValid(parsed.productId)) ||
      (parsed.sellerId && !mongoose.Types.ObjectId.isValid(parsed.sellerId)) ||
      (parsed.orderId && !mongoose.Types.ObjectId.isValid(parsed.orderId))
    ) {
      throw Object.assign(new Error('Select a product or supplier to review'), { statusCode: 422 });
    }

    // Get product and seller
    const product = parsed.productId
      ? await ReviewRepository.findProductById(parsed.productId)
      : null;

    const sellerId = parsed.sellerId || product?.sellerId;
    if (!sellerId) {
      throw Object.assign(new Error('Supplier not found for review'), { statusCode: 404 });
    }

    // Find order for verified purchase
    let order = null;
    if (parsed.orderId) {
      order = await ReviewRepository.findOrderById(parsed.orderId, userId);
    }

    if (!order) {
      order = await ReviewRepository.findBuyerOrder(userId, parsed.productId, sellerId);
    }

    // Check for duplicate
    const existing = await ReviewRepository.findDuplicate(
      userId, sellerId, parsed.productId, order?._id
    );
    if (existing) {
      throw Object.assign(new Error('You have already reviewed this experience'), { statusCode: 409 });
    }

    // Create review
    const review = await ReviewRepository.create({
      userId,
      sellerId,
      productId: parsed.productId || undefined,
      orderId: order?._id || parsed.orderId || undefined,
      rating: {
        overall: parsed.rating,
        quality: parsed.quality || parsed.rating,
        communication: parsed.communication || parsed.rating,
        shipping: parsed.shipping || parsed.rating,
        value: parsed.value || parsed.rating,
      },
      title: parsed.title,
      comment: parsed.comment,
      images: parsed.images,
      verifiedPurchase: Boolean(order),
      status: 'published',
    });

    // Refresh ratings
    await Promise.all([
      ReviewRepository.refreshProductRating(parsed.productId),
      ReviewRepository.refreshSellerRating(sellerId),
    ]);

    // Notify seller
    const seller = await ReviewRepository.findProductById(parsed.productId);
    const sellerData = sellerId ? await (async () => {
      const Seller = (await import('../models/Seller.js')).default;
      return Seller.findById(sellerId).select('userId companyName').lean();
    })() : null;

    if (sellerData?.userId && String(sellerData.userId) !== String(userId)) {
      await NotificationService.createNotification({
        userId: sellerData.userId,
        notificationType: parsed.productId ? 'review_received' : 'rating_received',
        title: parsed.productId ? 'New product review received' : 'New supplier rating received',
        description: `${parsed.rating} star feedback${product?.name ? ` for ${product.name}` : ` for ${sellerData.companyName || 'your supplier profile'}`}.`,
        data: {
          relatedId: review._id,
          relatedModel: 'Review',
          actionUrl: '/dashboard/reviews',
        },
        priority: parsed.rating <= 2 ? 'high' : 'medium',
      });
    }

    // Return populated review
    const populatedReview = await ReviewRepository.getPopulatedReview(review._id);
    return { review: populatedReview };
  }

  /**
   * Update an existing review
   */
  static async updateReview(userId, data) {
    const parsed = createReviewSchema.parse(data);

    if (!parsed.reviewId) {
      throw Object.assign(new Error('reviewId is required'), { statusCode: 422 });
    }
    if (!mongoose.Types.ObjectId.isValid(parsed.reviewId)) {
      throw Object.assign(new Error('Review not found'), { statusCode: 404 });
    }

    const review = await ReviewRepository.findByIdAndUser(parsed.reviewId, userId);
    if (!review) {
      throw Object.assign(new Error('Review not found'), { statusCode: 404 });
    }

    // Update review
    review.rating = {
      overall: parsed.rating,
      quality: parsed.quality || parsed.rating,
      communication: parsed.communication || parsed.rating,
      shipping: parsed.shipping || parsed.rating,
      value: parsed.value || parsed.rating,
    };
    review.title = parsed.title;
    review.comment = parsed.comment;
    review.images = parsed.images;
    review.updatedAt = new Date();
    await ReviewRepository.save(review);

    // Refresh ratings
    await Promise.all([
      ReviewRepository.refreshProductRating(review.productId),
      ReviewRepository.refreshSellerRating(review.sellerId),
    ]);

    return { review };
  }

  /**
   * Seller responds to a review
   */
  static async addSellerResponse(userId, roles, reviewId, comment) {
    const seller = await ReviewRepository.findSellerByUserId(userId);
    if (!seller) {
      throw Object.assign(new Error('Seller profile not found'), { statusCode: 404 });
    }

    const review = await ReviewRepository.addSellerResponse(reviewId, seller._id, comment);
    if (!review) {
      throw Object.assign(new Error('Review not found'), { statusCode: 404 });
    }

    // Notify buyer
    if (review.userId?._id || review.userId) {
      await NotificationService.createNotification({
        userId: review.userId?._id || review.userId,
        notificationType: 'review_response',
        title: 'Supplier responded to your review',
        description: comment.slice(0, 140),
        data: {
          relatedId: review._id,
          relatedModel: 'Review',
          actionUrl: '/dashboard/buyer/reviews',
        },
        priority: 'medium',
      });
    }

    return { review };
  }
}

export default ReviewService;