// repositories/product.repository.js
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import ProductCategoryMapping from '../models/ProductCategoryMapping.js';
import mongoose from 'mongoose';

// ✅ Bounded cache with TTL
const MAX_CACHE_ENTRIES = 500;
const LISTING_CACHE_TTL = 30000;  // 5 sec → 30 sec (test runs ke beech expire na ho)
const COUNT_CACHE_TTL = 60000;   // 30 seconds for counts (counts change rarely)

const cache = {
  sellers: { data: null, time: 0 },
  listings: {},
  counts: {}, // ← NEW: separate cache for counts
};

class ProductRepository {
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Get total public products count — cached for 30 seconds
   * Count rarely changes, no need to query every time
   */
  static async getPublicProductCount(filter = {}) {
    const cacheKey = `count:${JSON.stringify(filter)}`;
    const cached = cache.counts[cacheKey];
    
    if (cached && (Date.now() - cached.time) < COUNT_CACHE_TTL) {
      return cached.data;
    }

    const count = await Product.countDocuments({
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true,
      ...filter,
    });

    // Store in cache
    cache.counts[cacheKey] = { data: count, time: Date.now() };

    // Bounded cache cleanup
    if (Object.keys(cache.counts).length > 100) {
      cache.counts = {};
    }

    return count;
  }

  /**
   * ✅ OPTIMIZED: Products + count fetched sequentially (NOT parallel)
   * Parallel queries compete for connections and are SLOWER
   */
  static async getPublicProducts(filter = {}, options = {}) {
    const { page = 1, limit = 12, sort = 'createdAt', order = -1 } = options;
    const skip = (page - 1) * limit;

    // Cache key for listings
    const cacheKey = `listings:${page}:${limit}:${sort}:${order}:${JSON.stringify(filter)}`;
    const cached = cache.listings[cacheKey];
    
    if (cached && (Date.now() - cached.time) < LISTING_CACHE_TTL) {
      return cached.data;
    }

    // Single collection query — no $in, no seller join
    const query = {
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true,
      ...filter,
    };

    // ✅ SEQUENTIAL — NOT parallel (faster when connection pool is limited)
    const products = await Product.find(query)
  .select('name images price unit minimumOrderQuantity category subcategory averageRating sellerId')
  .sort({ [sort]: order })
  .skip(skip)
  .limit(limit)
  .lean()
  .hint('idx_public_listing_subcat'); 

    // Get count — either from cache or fresh
    const total = await this.getPublicProductCount(filter);

    // Ultra-minimal response
    const formatted = products.map(p => ({
      _id: p._id,
      name: p.name,
      image: p.images?.[0] || null,
      price: p.price,
      unit: p.unit,
      moq: p.minimumOrderQuantity,
      category: p.category,
      subcategory: p.subcategory,
      rating: p.averageRating || 0,
      verified: true,
    }));

    const result = {
      products: formatted,
      total,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };

    // Store in bounded cache
    if (Object.keys(cache.listings).length >= MAX_CACHE_ENTRIES) {
      cache.listings = {};
    }
    cache.listings[cacheKey] = { data: result, time: Date.now() };

    return result;
  }

  /**
   * Categories aggregation — unchanged
   */
  static async getProductCategories(filter = {}) {
    const categories = await Product.aggregate([
      {
        $match: {
          status: { $in: ['active', 'published'] },
          isVerifiedSeller: true,
          ...filter,
        },
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          name: '$_id',
          count: 1,
        },
      },
    ]);

    return categories.filter(c => c.name);
  }

  /**
   * Seller products — unchanged
   */
  static async getSellerProducts(sellerId, filter = {}, options = {}) {
    const { page = 1, limit = 12, sort = 'createdAt', order = -1 } = options;
    const skip = (page - 1) * limit;
    const query = { sellerId, ...filter };

    // ✅ Sequential for seller dashboard too
    const products = await Product.find(query)
      .select('name slug category subcategory price unit minimumOrderQuantity images status averageRating reviewCount createdAt')
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Product.countDocuments(query);

    return { products, total };
  }

  /**
   * Product detail — optimized populate
   */
  static async findByIdOrSlug(productId) {
    const query = this.isValidId(productId)
      ? { _id: new mongoose.Types.ObjectId(productId) }
      : { slug: String(productId).toLowerCase() };

    return Product.findOne(query)
      .populate('sellerId', 'name isVerified logo companyName city state')
      .lean();
  }

  /**
   * Similar products
   */
  static async getSimilarProducts(productId, category, limit = 6) {
    return Product.find({
      _id: { $ne: productId },
      category,
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true,
    })
      .select('name slug images price averageRating minimumOrderQuantity')
      .limit(limit)
      .lean();
  }

  static async findById(productId) {
    if (!this.isValidId(productId)) return null;
    return Product.findById(productId);
  }

  static async create(data) {
    const product = await Product.create(data);
    cache.listings = {};
    cache.counts = {};  // ← Clear count cache on write
    return product;
  }

  static async save(product) {
    const saved = await product.save();
    cache.listings = {};
    cache.counts = {};
    return saved;
  }

  static async delete(productId) {
    const deleted = await Product.findByIdAndDelete(productId);
    if (deleted) {
      cache.listings = {};
      cache.counts = {};
    }
    return deleted;
  }

  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id isVerified').lean();
  }

  static async findCategoryAndSubcategory(categoryId, subcategoryId) {
    if (!this.isValidId(categoryId) || !this.isValidId(subcategoryId)) {
      return [null, null];
    }
    return Promise.all([
      Category.findOne({ _id: categoryId, isActive: true }).lean(),
      Subcategory.findOne({ _id: subcategoryId, categoryId, isActive: true }).lean(),
    ]);
  }

  static async upsertCategoryMapping(productId, categoryId, subcategoryId) {
    return ProductCategoryMapping.findOneAndUpdate(
      { productId, categoryId, subcategoryId },
      { $set: { isPrimary: true } },
      { upsert: true }
    );
  }

  static async deleteCategoryMappings(productId) {
    return ProductCategoryMapping.deleteMany({ productId });
  }

  static async incrementSellerProductCount(sellerId) {
    return Seller.updateOne({ _id: sellerId }, { $inc: { totalProducts: 1 } });
  }

  static async decrementSellerProductCount(sellerId) {
    return Seller.updateOne({ _id: sellerId }, { $inc: { totalProducts: -1 } });
  }

  /**
   * Sync isVerifiedSeller flag when seller status changes
   */
  static async syncVerifiedFlagForSeller(sellerId, isVerified, isActive, isSuspended) {
    const shouldBeVerified = isVerified && isActive && !isSuspended;
    const result = await Product.updateMany(
      { sellerId },
      { $set: { isVerifiedSeller: shouldBeVerified } }
    );
    // Clear caches after sync
    cache.listings = {};
    cache.counts = {};
    return result;
  }
}

export default ProductRepository;