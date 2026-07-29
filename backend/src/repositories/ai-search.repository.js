import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Category from '../models/Category.js';
import RFQ from '../models/RFQ.js';
import Quotation from '../models/Quotation.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';
import { getSearchTerms, buildRegex, summarizeMarketplaceResults } from '../lib/ai-marketplace-context.js';
import { listServices } from '../lib/services-catalog.js';

const PUBLIC_SERVICE_KEYS = new Set([
  'shipping', 'trade-assurance', 'escrow', 'quality-inspection',
  'supplier-verification', 'warehousing', 'trade-financing',
  'customs-brokerage', 'dispute-resolution', 'market-analytics',
  'documentation-support', 'consulting', 'tax-calculator',
]);

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 30000;
const MAX_CACHE_ENTRIES = 250;

function normalizedTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function productRelevance(product, terms) {
  const fields = [
    [product.name, 10],
    [product.subcategory, 8],
    [product.category, 7],
    [product.tags?.join?.(' '), 6],
    [product.specifications, 4],
    [product.description, 2],
  ];
  const termList = [...new Set(terms.flatMap(normalizedTokens))];
  const textScore = fields.reduce((total, [value, weight]) => {
    const haystack = ` ${normalizedTokens(value).join(' ')} `;
    return total + termList.reduce((score, term) => {
      if (!haystack.includes(` ${term} `)) return score;
      return score + weight;
    }, 0);
  }, 0);
  const qualityTieBreak = Math.min(2.5, Number(product.averageRating || 0) * 0.3)
    + Math.min(1.5, Math.log10(Number(product.totalOrders || 0) + 1) * 0.4)
    + (product.sellerId?.isVerified ? 0.75 : 0);
  return Math.round((textScore + qualityTieBreak) * 100) / 100;
}

export function rankVisualProducts(products, terms, limit = products.length) {
  return products
    .map((product) => ({ ...product, visualRelevanceScore: productRelevance(product, terms) }))
    .sort((left, right) => right.visualRelevanceScore - left.visualRelevanceScore)
    .slice(0, limit);
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

class AISearchRepository {
  /**
   * Get full marketplace search results
   */
  static async searchMarketplace({ query, filters = {}, userId = null }) {
    const productLimit = Math.min(Number(process.env.AI_MARKETPLACE_PRODUCT_LIMIT || 24), 60);
    const supplierLimit = Math.min(Number(process.env.AI_MARKETPLACE_SUPPLIER_LIMIT || 16), 40);
    const categoryLimit = Math.min(Number(process.env.AI_MARKETPLACE_CATEGORY_LIMIT || 10), 30);
    const rfqLimit = Math.min(Number(process.env.AI_MARKETPLACE_RFQ_LIMIT || 8), 20);
    const orderLimit = Math.min(Number(process.env.AI_MARKETPLACE_ORDER_LIMIT || 8), 20);

    const terms = getSearchTerms(query, filters);
    const cacheKey = !userId ? `ai-search:${JSON.stringify({ terms, filters, productLimit, supplierLimit, categoryLimit, rfqLimit, orderLimit })}` : null;

    if (cacheKey) {
      const cached = getCached(cacheKey);
      if (cached) return cached;
    }

    const results = await this.searchMarketplaceUncached({
      query, filters, userId, productLimit, supplierLimit,
      categoryLimit, rfqLimit, orderLimit, terms,
    });

    if (cacheKey) setCached(cacheKey, results);
    return results;
  }

  /**
   * Uncached marketplace search
   */
  static async searchMarketplaceUncached({
    query, filters = {}, userId = null,
    productLimit, supplierLimit, categoryLimit, rfqLimit, orderLimit, terms,
  }) {
    const regex = buildRegex(terms);

    const productOr = regex ? [
      { name: { $regex: regex, $options: 'i' } },
      { category: { $regex: regex, $options: 'i' } },
      { subcategory: { $regex: regex, $options: 'i' } },
      { description: { $regex: regex, $options: 'i' } },
      { tags: { $regex: regex, $options: 'i' } },
    ] : [];

    const sellerOr = regex ? [
      { companyName: { $regex: regex, $options: 'i' } },
      { companyDescription: { $regex: regex, $options: 'i' } },
      { companyType: { $regex: regex, $options: 'i' } },
      { productCategories: { $regex: regex, $options: 'i' } },
      { exportMarkets: { $regex: regex, $options: 'i' } },
      { 'address.city': { $regex: regex, $options: 'i' } },
      { 'address.state': { $regex: regex, $options: 'i' } },
      { 'address.country': { $regex: regex, $options: 'i' } },
    ] : [];

    const rfqOr = regex ? [
      { title: { $regex: regex, $options: 'i' } },
      { description: { $regex: regex, $options: 'i' } },
      { category: { $regex: regex, $options: 'i' } },
      { subcategory: { $regex: regex, $options: 'i' } },
      { specifications: { $regex: regex, $options: 'i' } },
      { deliveryCountry: { $regex: regex, $options: 'i' } },
    ] : [];

    const productQuery = {
      status: { $in: ['active', 'published'] },
      isVerifiedSeller: true,
      ...(productOr.length ? { $or: productOr } : {}),
    };
    if (filters.lowMoq) productQuery.minimumOrderQuantity = { $lte: 100 };
    if (filters.targetPrice) productQuery.price = { $lte: filters.targetPrice };

    const sellerQuery = {
      isActive: true,
      isSuspended: { $ne: true },
      ...(filters.requireVerified ? { isVerified: true } : {}),
      ...(sellerOr.length ? { $or: sellerOr } : {}),
    };

    const rfqQuery = {
      visibility: 'public',
      status: { $in: ['active', 'pending', 'quoted', 'negotiating'] },
      ...(rfqOr.length ? { $or: rfqOr } : {}),
    };

    const [rawProducts, suppliers, rfqs] = await Promise.all([
      Product.find(productQuery)
        .select('name slug category subcategory price currency minimumOrderQuantity unit images averageRating totalOrders sellerId tags description specifications sampleAvailable samplePrice leadTime')
        .populate('sellerId', 'companyName isVerified rating trustScore address companyType')
        .sort({ averageRating: -1, totalOrders: -1, createdAt: -1 })
        .limit(Math.min(productLimit * 4, 120))
        .lean()
        .exec(),
      Seller.find(sellerQuery)
        .select('companyName companyType companyDescription address isVerified trustScore rating productCategories exportMarkets userId')
        .populate('userId', 'fullName email')
        .sort({ isVerified: -1, trustScore: -1, rating: -1, createdAt: -1 })
        .limit(supplierLimit)
        .lean()
        .exec(),
      RFQ.find(rfqQuery)
        .select('title description category subcategory quantity unit targetPrice currency deliveryCountry status quotationCount createdAt')
        .sort({ createdAt: -1 })
        .limit(rfqLimit)
        .lean()
        .exec(),
    ]);

    const products = rankVisualProducts(rawProducts, terms, productLimit);

    // Get user-specific data
    let quotations = [];
    let orders = [];
    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const seller = await Seller.findOne({ userId }).select('_id').lean().exec();
        const buyerRfqIds = await RFQ.distinct('_id', { buyerId: userId });

        const orderQuery = {
          $or: [
            { buyerId: userId },
            { userId },
            ...(seller?._id ? [{ sellerId: seller._id }] : []),
          ],
        };

        [quotations, orders] = await Promise.all([
          Quotation.find({
            $or: [
              { rfqId: { $in: buyerRfqIds } },
              { userId },
              ...(seller?._id ? [{ sellerId: seller._id }] : []),
            ],
            status: { $nin: ['withdrawn', 'expired'] },
          })
            .select('rfqId sellerId productId unitPrice totalPrice currency minimumOrderQuantity leadTime leadTimeUnit paymentTerms incoterms status updatedAt')
            .populate('sellerId', 'companyName isVerified rating trustScore')
            .populate('rfqId', 'title category quantity unit deliveryCountry')
            .populate('productId', 'name')
            .sort({ updatedAt: -1 })
            .limit(20)
            .lean()
            .exec(),
          Order.find(orderQuery)
            .select('orderNumber buyerId sellerId productId products status orderType orderSubType quantity totalAmount totalPrice currency paymentStatus trackingNumber createdAt updatedAt')
            .populate('sellerId', 'companyName isVerified')
            .populate('productId', 'name')
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(orderLimit)
            .lean()
            .exec(),
        ]);
      }
    }

    const countries = [...new Set([
      ...suppliers.map(s => s.address?.country),
      ...rawProducts.map(p => p.sellerId?.address?.country || p.countryOfOrigin),
      ...rfqs.map(r => r.deliveryCountry),
    ].filter(Boolean))].slice(0, 12);

    return {
      terms,
      products,
      suppliers,
      sellers: suppliers,
      manufacturers: suppliers.filter(s => s.companyType === 'manufacturer'),
      categories: [],
      countries,
      services: [],
      rfqs,
      quotations,
      orders,
    };
  }

  /**
   * Search categories matching terms
   */
  static async searchCategories(terms, limit = 8) {
    const termRegex = terms.length
      ? terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      : null;

    return Category.find({
      isActive: true,
      ...(termRegex ? {
        $or: [
          { name: { $regex: termRegex, $options: 'i' } },
          { description: { $regex: termRegex, $options: 'i' } },
          { 'metadata.keywords': { $regex: termRegex, $options: 'i' } },
        ],
      } : {}),
    })
      .sort({ 'metadata.isFeatured': -1, 'metadata.sortOrder': 1, name: 1 })
      .limit(limit)
      .lean()
      .exec();
  }

  /**
   * Search services matching terms
   */
  static searchServices(terms) {
    const termRegex = terms.length
      ? terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      : null;

    return listServices()
      .filter(service => PUBLIC_SERVICE_KEYS.has(service.key))
      .filter(service => {
        if (!termRegex) return true;
        const searchable = `${service.title} ${service.description} ${service.key}`.toLowerCase();
        return terms.some(term => searchable.includes(String(term).toLowerCase()));
      })
      .slice(0, 6)
      .map(service => ({
        key: service.key,
        title: service.title,
        description: service.description,
        href: `/services/${service.key}`,
      }));
  }
}

export default AISearchRepository;
