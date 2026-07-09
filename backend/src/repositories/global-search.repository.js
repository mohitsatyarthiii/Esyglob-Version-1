import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';
import RFQ from '../models/RFQ.js';

class GlobalSearchRepository {
  /**
   * Escape regex special characters
   */
  static escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract search terms from query
   */
  static termsFromQuery(query) {
    return String(query || '')
      .toLowerCase()
      .replace(/[^\w\s.-]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1)
      .slice(0, 8);
  }

  /**
   * Build regex from query
   */
  static buildRegex(query) {
    const safe = this.escapeRegex(query);
    const terms = this.termsFromQuery(query).map(t => this.escapeRegex(t));
    return [safe, ...terms].filter(Boolean).join('|');
  }

  static textQuery(query) {
    const terms = this.termsFromQuery(query);
    return terms.length ? { $search: terms.join(' ') } : null;
  }

  /**
   * Search products using aggregation
   */
  static async searchProducts(regex, limit = 16, textQuery = null) {
    return Product.aggregate([
      {
        $match: {
          status: { $in: ['active', 'published'] },
          isVerifiedSeller: true,
          ...(textQuery ? { $text: textQuery } : { name: { $regex: regex, $options: 'i' } }),
        },
      },
      { $sort: { averageRating: -1, totalOrders: -1, createdAt: -1 } },
      { $limit: limit * 2 },
      {
        $lookup: {
          from: 'sellers',
          localField: 'sellerId',
          foreignField: '_id',
          as: 'seller',
          pipeline: [
            {
              $project: {
                companyName: 1,
                isVerified: 1,
                isTrustedSeller: 1,
                address: 1,
                companyType: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$seller', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          category: 1,
          subcategory: 1,
          brand: 1,
          countryOfOrigin: 1,
          price: 1,
          currency: 1,
          minimumOrderQuantity: 1,
          images: { $slice: ['$images', 3] },
          tags: 1,
          description: 1,
          averageRating: 1,
          totalOrders: 1,
          sellerId: '$seller',
        },
      },
    ]);
  }

  /**
   * Search suppliers
   */
  static async searchSuppliers(regex, limit = 16, textQuery = null) {
    return Seller.find({
      isActive: true,
      isSuspended: { $ne: true },
      ...(textQuery ? { $text: textQuery } : { companyName: { $regex: regex, $options: 'i' } }),
    })
      .select('companyName companyType companyDescription address isVerified isTrustedSeller trustScore rating productCategories exportMarkets logo logoUrl companyLogo')
      .sort({ isTrustedSeller: -1, isVerified: -1, trustScore: -1, rating: -1 })
      .limit(limit * 2)
      .lean();
  }

  /**
   * Search categories
   */
  static async searchCategories(regex, limit = 8, textQuery = null) {
    return Category.find({
      isActive: true,
      ...(textQuery ? { $text: textQuery } : { name: { $regex: regex, $options: 'i' } }),
    })
      .select('name slug description image metadata')
      .sort({ 'metadata.isFeatured': -1, 'metadata.sortOrder': 1, name: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Search subcategories
   */
  static async searchSubcategories(regex, limit = 8) {
    return Subcategory.find({
      isActive: true,
      $or: [
        { name: { $regex: regex, $options: 'i' } },
        { slug: { $regex: regex, $options: 'i' } },
        { description: { $regex: regex, $options: 'i' } },
        { 'metadata.keywords': { $regex: regex, $options: 'i' } },
      ],
    })
      .select('name slug description image metadata categoryId')
      .populate('categoryId', 'name slug')
      .sort({ 'metadata.isFeatured': -1, 'metadata.sortOrder': 1, name: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Search RFQs
   */
  static async searchRfqs(regex, limit = 8) {
    return RFQ.find({
      visibility: 'public',
      status: { $in: ['active', 'pending', 'quoted', 'negotiating'] },
      $or: [
        { title: { $regex: regex, $options: 'i' } },
        { description: { $regex: regex, $options: 'i' } },
        { category: { $regex: regex, $options: 'i' } },
        { subcategory: { $regex: regex, $options: 'i' } },
        { deliveryCountry: { $regex: regex, $options: 'i' } },
        { specifications: { $regex: regex, $options: 'i' } },
      ],
    })
      .select('title description category subcategory quantity unit deliveryCountry status createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}

export default GlobalSearchRepository;
