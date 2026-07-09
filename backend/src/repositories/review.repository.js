import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';

class ReviewRepository {
  /**
   * Build rating summary from aggregation
   */
  static async buildSummary(match) {
    const [summaryRows, breakdownRows] = await Promise.all([
      Review.aggregate([
        { $match: { ...match, status: 'published' } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating.overall' },
            reviewCount: { $sum: 1 },
          },
        },
      ]),
      Review.aggregate([
        { $match: { ...match, status: 'published' } },
        { $group: { _id: '$rating.overall', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
    ]);

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    breakdownRows.forEach(row => {
      breakdown[row._id] = row.count;
    });

    return {
      averageRating: Number((summaryRows[0]?.averageRating || 0).toFixed(1)),
      reviewCount: summaryRows[0]?.reviewCount || 0,
      breakdown,
    };
  }

  /**
   * Update product average rating
   */
  static async refreshProductRating(productId) {
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) return;
    const summary = await this.buildSummary({ productId: new mongoose.Types.ObjectId(productId) });
    await Product.findByIdAndUpdate(productId, {
      averageRating: summary.averageRating,
      reviewCount: summary.reviewCount,
    });
  }

  /**
   * Update seller average rating
   */
  static async refreshSellerRating(sellerId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) return;
    const summary = await this.buildSummary({ sellerId: new mongoose.Types.ObjectId(sellerId) });
    await Seller.findByIdAndUpdate(sellerId, {
      rating: summary.averageRating,
      reviewCount: summary.reviewCount,
    });
  }

  /**
   * Get reviews with filters
   */
  static async getReviews(query, limit = 20) {
    const { productId, sellerId, userId, sellerDashboard } = query;
    const filter = { status: 'published' };

    if (productId) filter.productId = productId;
    if (sellerId) filter.sellerId = sellerId;
    if (userId) filter.userId = userId;

    const reviews = await Review.find(filter)
      .populate('userId', 'email fullName firstName lastName avatarUrl')
      .populate('productId', 'name images')
      .populate({
        path: 'sellerId',
        select: 'companyName companyLogo logo logoUrl userId',
        populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Build summary
    const summaryMatch = {};
    if (productId) summaryMatch.productId = new mongoose.Types.ObjectId(productId);
    if (sellerId || filter.sellerId) summaryMatch.sellerId = new mongoose.Types.ObjectId(String(sellerId || filter.sellerId));
    if (userId) summaryMatch.userId = new mongoose.Types.ObjectId(userId);

    const summary = await this.buildSummary(summaryMatch);

    return { reviews, ...summary };
  }

  /**
   * Find review by ID and user
   */
  static async findByIdAndUser(reviewId, userId) {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) return null;
    return Review.findOne({ _id: reviewId, userId });
  }

  /**
   * Find duplicate review
   */
  static async findDuplicate(userId, sellerId, productId, orderId) {
    return Review.findOne({
      userId,
      sellerId,
      ...(productId ? { productId } : { productId: { $exists: false } }),
      ...(orderId ? { orderId } : {}),
    });
  }

  /**
   * Create review
   */
  static async create(data) {
    return Review.create(data);
  }

  /**
   * Save review
   */
  static async save(review) {
    return review.save();
  }

  /**
   * Add seller response to review
   */
  static async addSellerResponse(reviewId, sellerId, comment) {
    if (!mongoose.Types.ObjectId.isValid(reviewId)) return null;

    return Review.findOneAndUpdate(
      { _id: reviewId, sellerId, status: 'published' },
      {
        sellerResponse: {
          comment,
          respondedAt: new Date(),
        },
        updatedAt: new Date(),
      },
      { new: true }
    )
      .populate('userId', 'email fullName firstName lastName avatarUrl')
      .populate('productId', 'name images')
      .populate({
        path: 'sellerId',
        select: 'companyName companyLogo logo logoUrl userId',
        populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
      })
      .lean();
  }

  /**
   * Find seller by userId
   */
  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id').lean();
  }

  /**
   * Find product by ID
   */
  static async findProductById(productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) return null;
    return Product.findById(productId).select('sellerId name').lean();
  }

  /**
   * Find order for buyer
   */
  static async findBuyerOrder(userId, productId, sellerId) {
    const orderQuery = {
      $or: [{ buyerId: userId }, { userId }],
      sellerId,
      status: { $in: ['delivered', 'completed', 'payment_confirmed', 'confirmed'] },
    };
    if (productId) orderQuery.productId = productId;
    return Order.findOne(orderQuery).lean();
  }

  /**
   * Find order by ID
   */
  static async findOrderById(orderId, userId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) return null;
    return Order.findOne({
      _id: orderId,
      $or: [{ buyerId: userId }, { userId }],
    }).lean();
  }

  /**
   * Get populated review
   */
  static async getPopulatedReview(reviewId) {
    const review = await Review.findById(reviewId);
    if (!review) return null;

    await review.populate('userId', 'email fullName firstName lastName avatarUrl');
    await review.populate('productId', 'name images');
    await review.populate({
      path: 'sellerId',
      select: 'companyName companyLogo logo logoUrl userId',
      populate: { path: 'userId', select: 'fullName avatarUrl avatar profileImage' },
    });

    return review;
  }
}

export default ReviewRepository;