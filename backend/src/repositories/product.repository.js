import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import ProductCategoryMapping from '../models/ProductCategoryMapping.js';
import Seller from '../models/Seller.js';
import Subcategory from '../models/Subcategory.js';
import { PUBLIC_PRODUCT_ELIGIBILITY, PUBLIC_SELLER_ELIGIBILITY, publicProductQuery } from '../lib/marketplace-eligibility.js';

const MAX_CACHE_ENTRIES = 500;
const LISTING_CACHE_TTL = 30000;
const COUNT_CACHE_TTL = 60000;

const cache = {
  listings: {},
  counts: {},
};

function clearProductCaches() {
  cache.listings = {};
  cache.counts = {};
}

class ProductRepository {
  static async verifiedSellerIds() {
    return Seller.distinct('_id', PUBLIC_SELLER_ELIGIBILITY).exec();
  }
  static isValidId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  static async resolveListingTaxonomy(category, subcategory) {
    let categoryDoc = null;
    let subcategoryDoc = null;

    if (category) {
      const value = String(category).trim();
      const filter = this.isValidId(value)
        ? { _id: value, isActive: true }
        : { isActive: true, $or: [{ slug: value.toLowerCase() }, { name: value }] };
      categoryDoc = await Category.findOne(filter).select('_id name slug').lean().exec();
    }

    if (subcategory) {
      const value = String(subcategory).trim();
      const filter = this.isValidId(value)
        ? { _id: value, isActive: true }
        : { isActive: true, $or: [{ slug: value.toLowerCase() }, { name: value }] };

      if (categoryDoc) {
        filter.categoryId = categoryDoc._id;
      }

      subcategoryDoc = await Subcategory.findOne(filter).select('_id categoryId name slug').lean().exec();
    }

    return { categoryDoc, subcategoryDoc };
  }

  static async getPublicProductCount(filter = {}) {
    const cacheKey = `count:${JSON.stringify(filter)}`;
    const cached = cache.counts[cacheKey];

    if (cached && Date.now() - cached.time < COUNT_CACHE_TTL) {
      return cached.data;
    }

    const verifiedSellerIds = await this.verifiedSellerIds();
    const count = await Product.countDocuments(publicProductQuery(filter, verifiedSellerIds)).exec();

    cache.counts[cacheKey] = { data: count, time: Date.now() };

    if (Object.keys(cache.counts).length > 100) {
      cache.counts = {};
    }

    return count;
  }

  static async getPublicProducts(filter = {}, options = {}) {
    const { page = 1, limit = 12, sort = 'createdAt', order = -1 } = options;
    const skip = (page - 1) * limit;
    const cacheKey = `listings:${page}:${limit}:${sort}:${order}:${JSON.stringify(filter)}`;
    const cached = cache.listings[cacheKey];

    if (cached && Date.now() - cached.time < LISTING_CACHE_TTL) {
      return cached.data;
    }

    const verifiedSellerIds = await this.verifiedSellerIds();
    const query = publicProductQuery(filter, verifiedSellerIds);

    const listQuery = Product.find(query)
      .select('name slug images price currency unit minimumOrderQuantity category subcategory averageRating reviewCount totalOrders sellerId leadTime deliveryTime shipping countryOfOrigin discount badge isBestSeller createdAt')
      .populate('sellerId', 'companyName isVerified verificationStatus rating trustScore responseRate address country companyType')
      .sort(filter.$text ? { score: { $meta: 'textScore' }, [sort]: order } : { [sort]: order })
      .skip(skip)
      .limit(limit)
      .lean();

    if (!filter.$text && !filter.sellerId && sort === 'createdAt') {
      listQuery.hint(filter.subcategory ? 'idx_public_listing_subcat' : 'idx_public_listing');
    }

    const countKey = `count:${JSON.stringify(filter)}`;
    const cachedCount = cache.counts[countKey];
    const countPromise = cachedCount && Date.now() - cachedCount.time < COUNT_CACHE_TTL
      ? Promise.resolve(cachedCount.data)
      : this.getPublicProductCount(filter);

    const [products, total] = await Promise.all([
      listQuery.exec(),
      countPromise,
    ]);

    const formatted = products.map((product) => ({
      _id: product._id,
      name: product.name,
      image: product.images?.[0] || null,
      images: product.images || [],
      price: product.price,
      unit: product.unit,
      moq: product.minimumOrderQuantity,
      category: product.category,
      subcategory: product.subcategory,
      rating: product.averageRating || 0,
      reviewCount: product.reviewCount || 0,
      totalOrders: product.totalOrders || 0,
      verified: true,
      sellerId: product.sellerId,
      currency: product.currency,
      leadTime: product.leadTime,
      deliveryTime: product.deliveryTime,
      shipping: product.shipping,
      countryOfOrigin: product.countryOfOrigin,
      discount: product.discount,
      badge: product.badge,
      isBestSeller: product.isBestSeller,
    }));

    const result = {
      products: formatted,
      total,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };

    if (Object.keys(cache.listings).length >= MAX_CACHE_ENTRIES) {
      cache.listings = {};
    }
    cache.listings[cacheKey] = { data: result, time: Date.now() };

    return result;
  }

  static async getProductCategories(filter = {}) {
    const categories = await Product.aggregate([
      {
        $match: Object.keys(filter).length ? { $and: [PUBLIC_PRODUCT_ELIGIBILITY, filter] } : PUBLIC_PRODUCT_ELIGIBILITY,
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
    ]).exec();

    return categories.filter((category) => category.name);
  }

  static async getSellerProducts(sellerId, filter = {}, options = {}) {
    const { page = 1, limit = 12, sort = 'createdAt', order = -1 } = options;
    const skip = (page - 1) * limit;
    const query = { sellerId, ...filter };

    const [products, total] = await Promise.all([
      Product.find(query)
        .select('name slug category subcategory price unit minimumOrderQuantity images status averageRating reviewCount createdAt')
        .sort({ [sort]: order })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Product.countDocuments(query).exec(),
    ]);

    return { products, total };
  }

  static async findByIdOrSlug(productId) {
    const query = this.isValidId(productId)
      ? { _id: new mongoose.Types.ObjectId(productId) }
      : { slug: String(productId).toLowerCase() };

    return Product.findOne(query)
      .populate('sellerId', 'name isVerified verificationStatus isActive isSuspended isTrustedSeller trustedSellerBadge badges logo companyName companyType industries productCategories productSubcategories city state userId shippingReady shippingReadiness')
      .lean()
      .exec();
  }

  static async getSimilarProducts(productId, category, limit = 6) {
    const verifiedSellerIds = await this.verifiedSellerIds();
    return Product.find({
      $and: [PUBLIC_PRODUCT_ELIGIBILITY, { _id: { $ne: productId }, category, sellerId: { $in: verifiedSellerIds } }],
    })
      .select('name slug images price averageRating minimumOrderQuantity')
      .limit(limit)
      .lean()
      .exec();
  }

  static async getRelatedProductCandidates(product, limit = 80) {
    const verifiedSellerIds = await this.verifiedSellerIds();
    const taxonomy = [];
    if (product.subcategoryId) taxonomy.push({ subcategoryId: product.subcategoryId });
    if (product.subcategory) taxonomy.push({ subcategory: product.subcategory });
    if (product.categoryId) taxonomy.push({ categoryId: product.categoryId });
    if (product.category) taxonomy.push({ category: product.category });

    const terms = [product.name, ...(product.tags || [])]
      .flatMap((value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/))
      .filter((value) => value.length > 2)
      .slice(0, 8);
    const escaped = [...new Set(terms)].map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const relevanceMatchers = [...taxonomy];
    if (escaped.length) {
      const regex = new RegExp(escaped.join('|'), 'i');
      relevanceMatchers.push({ name: regex }, { tags: regex }, { description: regex });
    }
    if (!relevanceMatchers.length) return [];

    return Product.find({
      _id: { $ne: product._id },
      ...PUBLIC_PRODUCT_ELIGIBILITY,
      sellerId: { $in: verifiedSellerIds },
      $or: relevanceMatchers,
    })
      .select('name slug images price currency unit minimumOrderQuantity category categoryId subcategory subcategoryId brand description specifications productAttributes manufacturingDetails productType tags seo averageRating reviewCount totalOrders sellerId')
      .populate('sellerId', 'companyName companyType industries productCategories productSubcategories isVerified isActive isSuspended')
      .limit(limit)
      .lean()
      .exec();
  }

  static async findById(productId) {
    if (!this.isValidId(productId)) return null;
    return Product.findById(productId);
  }

  static async create(data) {
    const product = await Product.create(data);
    clearProductCaches();
    return product;
  }

  static async save(product) {
    const saved = await product.save();
    clearProductCaches();
    return saved;
  }

  static async delete(productId) {
    const deleted = await Product.findByIdAndDelete(productId).exec();
    if (deleted) clearProductCaches();
    return deleted;
  }

  static async findSellerByUserId(userId) {
    return Seller.findOne({ userId }).select('_id isVerified').lean().exec();
  }

  static async findCategoryAndSubcategory(categoryId, subcategoryId) {
    if (!this.isValidId(categoryId) || !this.isValidId(subcategoryId)) {
      return [null, null];
    }
    return Promise.all([
      Category.findOne({ _id: categoryId, isActive: true }).lean().exec(),
      Subcategory.findOne({ _id: subcategoryId, categoryId, isActive: true }).lean().exec(),
    ]);
  }

  static async upsertCategoryMapping(productId, categoryId, subcategoryId) {
    return ProductCategoryMapping.findOneAndUpdate(
      { productId, categoryId, subcategoryId },
      { $set: { isPrimary: true } },
      { upsert: true }
    ).exec();
  }

  static async deleteCategoryMappings(productId) {
    return ProductCategoryMapping.deleteMany({ productId }).exec();
  }

  static async incrementSellerProductCount(sellerId) {
    return Seller.updateOne({ _id: sellerId }, { $inc: { totalProducts: 1 } }).exec();
  }

  static async decrementSellerProductCount(sellerId) {
    return Seller.updateOne({ _id: sellerId }, { $inc: { totalProducts: -1 } }).exec();
  }

  static async syncVerifiedFlagForSeller(sellerId, isVerified, isActive, isSuspended) {
    const shouldBeVerified = isVerified && isActive && !isSuspended;
    const result = await Product.updateMany(
      { sellerId },
      { $set: { isVerifiedSeller: shouldBeVerified } }
    ).exec();
    clearProductCaches();
    return result;
  }
}

export default ProductRepository;
