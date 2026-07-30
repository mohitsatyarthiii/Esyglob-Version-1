import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Category from '../models/Category.js';
import RFQ from '../models/RFQ.js';
import Quotation from '../models/Quotation.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';
import { getSearchTerms, buildRegex, summarizeMarketplaceResults } from '../lib/ai-marketplace-context.js';
import { listServices } from '../lib/services-catalog.js';
import {
  buildVisualSearchProfile,
  productVisualRelevance,
  rankProductsByVisualRelevance,
} from '../lib/image-search.js';

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

export function productRelevance(product, terms) {
  return productVisualRelevance(product, terms);
}

export function rankVisualProducts(products, terms, limit = products.length) {
  return rankProductsByVisualRelevance(products, terms, limit);
}

const VISUAL_PRODUCT_FIELDS = 'name slug category subcategory productType brand price currency minimumOrderQuantity unit images averageRating reviewCount totalOrders sellerId tags description specifications productAttributes sampleAvailable samplePrice leadTime countryOfOrigin';

function productConditions(regex) {
  if (!regex) return [];
  return [
    { name: { $regex: regex, $options: 'i' } },
    { description: { $regex: regex, $options: 'i' } },
    { tags: { $regex: regex, $options: 'i' } },
    { category: { $regex: regex, $options: 'i' } },
    { subcategory: { $regex: regex, $options: 'i' } },
    { productType: { $regex: regex, $options: 'i' } },
    { brand: { $regex: regex, $options: 'i' } },
    { 'seo.keywords': { $regex: regex, $options: 'i' } },
    { 'productAttributes.material': { $regex: regex, $options: 'i' } },
    { 'specifications.material': { $regex: regex, $options: 'i' } },
  ];
}

function mergeDocuments(...groups) {
  const documents = new Map();
  groups.flat().filter(Boolean).forEach((document) => {
    const id = String(document._id || document.id || '');
    if (id && !documents.has(id)) documents.set(id, document);
  });
  return [...documents.values()];
}

async function searchAtlasVisualProducts(profile, limit) {
  const index = process.env.MONGODB_ATLAS_PRODUCT_SEARCH_INDEX;
  if (!index || !profile.searchText) return [];
  try {
    const should = [
      { text: { query: profile.analysis.productName || profile.searchText, path: 'name', score: { boost: { value: 8 } } } },
      ...(profile.broadTerms.length ? [
        { text: { query: profile.broadTerms, path: ['category', 'subcategory'], score: { boost: { value: 5 } } } },
        { text: { query: profile.broadTerms, path: ['tags', 'description', 'productType', 'brand'], score: { boost: { value: 2 } } } },
      ] : []),
    ];
    const products = await Product.aggregate([
      {
        $search: {
          index,
          compound: {
            should,
            minimumShouldMatch: 1,
          },
        },
      },
      { $match: { status: { $in: ['active', 'published'] }, isVerifiedSeller: true, visibility: { $ne: 'private' } } },
      { $addFields: { atlasSearchScore: { $meta: 'searchScore' } } },
      { $limit: limit },
    ]);
    return Product.populate(products, { path: 'sellerId', select: 'companyName isVerified verificationStatus rating trustScore address companyType responseRate' });
  } catch (error) {
    console.warn('[AI-Search] Atlas product search unavailable, using indexed marketplace fallback:', error.message);
    return [];
  }
}

async function searchRegexVisualProducts(terms, limit) {
  const regex = buildRegex(terms);
  const conditions = productConditions(regex);
  if (!conditions.length) return [];
  return Product.find({
    status: { $in: ['active', 'published'] },
    isVerifiedSeller: true,
    visibility: { $ne: 'private' },
    $or: conditions,
  })
    .select(VISUAL_PRODUCT_FIELDS)
    .populate('sellerId', 'companyName isVerified verificationStatus rating trustScore address companyType responseRate')
    .limit(limit)
    .lean()
    .exec();
}

function sellerRelevance(seller, products, profile) {
  const sellerId = String(seller._id || seller.id);
  const matchedProducts = products.filter((product) => String(product.sellerId?._id || product.sellerId) === sellerId);
  const searchable = JSON.stringify([
    seller.companyName, seller.companyDescription, seller.companyType, seller.productCategories,
    seller.productSubcategories, seller.industries, seller.mainProducts,
  ]).toLowerCase();
  const termMatches = profile.broadTerms.reduce((total, term) => total + (searchable.includes(String(term).toLowerCase()) ? 1 : 0), 0);
  return matchedProducts.length * 20 + termMatches * 3 + (seller.isVerified ? 2 : 0) + Math.min(1, Number(seller.trustScore || 0) / 100);
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
   * Image-led marketplace retrieval. Vision identifies the object; this method
   * performs all product, seller and category discovery from stored records.
   */
  static async searchVisualMarketplace({ analysis, userQuery = '' }) {
    const productLimit = Math.min(Number(process.env.AI_MARKETPLACE_PRODUCT_LIMIT || 24), 60);
    const supplierLimit = Math.min(Number(process.env.AI_MARKETPLACE_SUPPLIER_LIMIT || 16), 40);
    const profile = buildVisualSearchProfile(analysis, userQuery);

    if (!profile.identityTerms.length && !profile.broadTerms.length) {
      return {
        terms: [], products: [], suppliers: [], sellers: [], manufacturers: [],
        categories: [], countries: [], services: [], rfqs: [], quotations: [], orders: [],
      };
    }

    const candidateLimit = Math.min(productLimit * 4, 120);
    const [atlasCandidates, identityCandidates] = await Promise.all([
      searchAtlasVisualProducts(profile, candidateLimit),
      searchRegexVisualProducts(profile.identityTerms, candidateLimit),
    ]);

    let candidates = mergeDocuments(atlasCandidates, identityCandidates);
    if ((profile.analysis.confidence < 0.65 || candidates.length < productLimit * 2) && profile.broadTerms.length) {
      const broaderCandidates = await searchRegexVisualProducts(profile.broadTerms, candidateLimit);
      candidates = mergeDocuments(candidates, broaderCandidates);
    }

    const products = rankProductsByVisualRelevance(candidates, profile, productLimit);
    const productSellerIds = [...new Set(products
      .map((product) => product.sellerId?._id || product.sellerId)
      .filter(Boolean)
      .map(String))];
    const sellerRegex = buildRegex(profile.broadTerms);
    const sellerConditions = sellerRegex ? [
      { companyName: { $regex: sellerRegex, $options: 'i' } },
      { companyDescription: { $regex: sellerRegex, $options: 'i' } },
      { productCategories: { $regex: sellerRegex, $options: 'i' } },
      { productSubcategories: { $regex: sellerRegex, $options: 'i' } },
      { industries: { $regex: sellerRegex, $options: 'i' } },
      { mainProducts: { $regex: sellerRegex, $options: 'i' } },
    ] : [];
    const sellerOr = [
      ...(productSellerIds.length ? [{ _id: { $in: productSellerIds } }] : []),
      ...sellerConditions,
    ];
    const rawSellers = sellerOr.length
      ? await Seller.find({
        isActive: true,
        isSuspended: { $ne: true },
        $or: sellerOr,
      })
        .select('companyName companyType companyDescription companyLogo logo logoUrl coverImage companyPhotos address isVerified verificationStatus verificationLevel isTrustedSeller trustScore rating reviewCount responseRate averageResponseTimeHours onTimeDeliveryRate totalProducts totalOrders yearsInBusiness yearEstablished productCategories productSubcategories industries mainProducts userId')
        .populate('userId', 'fullName email')
        .limit(Math.min(supplierLimit * 3, 60))
        .lean()
        .exec()
      : [];
    const suppliers = rawSellers
      .map((seller) => ({
        ...seller,
        products: products
          .filter((product) => String(product.sellerId?._id || product.sellerId) === String(seller._id))
          .slice(0, 4),
        visualRelevanceScore: sellerRelevance(seller, products, profile),
      }))
      .filter((seller) => seller.visualRelevanceScore > 0)
      .sort((left, right) => right.visualRelevanceScore - left.visualRelevanceScore)
      .slice(0, supplierLimit);
    const categories = await this.searchCategories(profile.categoryTerms, 10);
    const countries = [...new Set(suppliers.map((seller) => seller.address?.country).filter(Boolean))].slice(0, 12);

    return {
      terms: profile.broadTerms,
      products,
      suppliers,
      sellers: suppliers,
      manufacturers: suppliers.filter((seller) => seller.companyType === 'manufacturer'),
      categories,
      countries,
      services: [],
      rfqs: [],
      quotations: [],
      orders: [],
    };
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
