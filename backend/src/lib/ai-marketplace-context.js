import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Category from '../models/Category.js';
import RFQ from '../models/RFQ.js';
import Quotation from '../models/Quotation.js';
import Order from '../models/Order.js';
import { listServices } from './services-catalog.js';

const STOP_WORDS = new Set([
  'find', 'show', 'need', 'with', 'from', 'for', 'the', 'and', 'best', 'top', 'help', 'me',
  'supplier', 'suppliers', 'category', 'categories', 'manufacturer', 'manufacturers', 'product', 'products',
]);

const PUBLIC_SERVICE_KEYS = new Set([
  'shipping', 'trade-assurance', 'escrow', 'quality-inspection', 'supplier-verification',
  'warehousing', 'trade-financing', 'customs-brokerage', 'dispute-resolution',
  'market-analytics', 'documentation-support', 'consulting', 'tax-calculator',
]);

function publicProductLink(product) {
  return `/products/${product?._id}`;
}

function publicSupplierLink(seller) {
  return `/manufacturers/${seller?._id}`;
}

function publicCategoryLink(category) {
  return `/categories/${encodeURIComponent(category?.slug || category?.name || '')}`;
}

function publicRfqLink(rfq) {
  return `/rfqs/${rfq?._id}`;
}

function accountOrderLink(order, role = 'buyer') {
  return `/dashboard/${role === 'seller' ? 'seller' : 'buyer'}/orders/${order?._id}`;
}

function publicServiceLink(service) {
  return PUBLIC_SERVICE_KEYS.has(service?.key) ? `/services/${service.key}` : null;
}

export function getSearchTerms(query, filters = {}) {
  const aiTerms = [
    ...(filters.keywords || []),
    ...(filters.categories || []),
    ...(filters.countries || []),
  ];

  const fallbackTerms = String(query || '')
    .toLowerCase()
    .replace(/[^\w\s.-]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 2 && !STOP_WORDS.has(term));

  return [...new Set([...aiTerms, ...fallbackTerms].map(term => String(term).trim()).filter(Boolean))].slice(0, 12);
}

export function buildRegex(terms) {
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  return escaped.length ? escaped.join('|') : null;
}

// Simple in-memory cache for public queries
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds
const MAX_CACHE_ENTRIES = 250;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export async function getAISearchResults({ query, filters = {}, userId = null }) {
  const productLimit = Math.min(Number(process.env.AI_MARKETPLACE_PRODUCT_LIMIT || 24), 60);
  const supplierLimit = Math.min(Number(process.env.AI_MARKETPLACE_SUPPLIER_LIMIT || 16), 40);
  const categoryLimit = Math.min(Number(process.env.AI_MARKETPLACE_CATEGORY_LIMIT || 10), 30);
  const rfqLimit = Math.min(Number(process.env.AI_MARKETPLACE_RFQ_LIMIT || 8), 20);
  const orderLimit = Math.min(Number(process.env.AI_MARKETPLACE_ORDER_LIMIT || 8), 20);
  const terms = getSearchTerms(query, filters);

  // Authenticated results include private account context, so userId is part
  // of the cache key. Reuse remains permission-isolated.
  const cacheKey = `ai-market:${JSON.stringify({ userId: userId ? String(userId) : 'public', terms, filters, productLimit, supplierLimit, categoryLimit, rfqLimit, orderLimit })}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const results = await getAISearchResultsUncached({
    query, filters, userId, productLimit, supplierLimit, categoryLimit, rfqLimit, orderLimit, terms,
  });
  setCache(cacheKey, results);
  return results;
}

async function getAISearchResultsUncached({
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

  const categoryOr = regex ? [
    { name: { $regex: regex, $options: 'i' } },
    { slug: { $regex: regex, $options: 'i' } },
    { description: { $regex: regex, $options: 'i' } },
    { 'metadata.keywords': { $regex: regex, $options: 'i' } },
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

  const categoryQuery = {
    isActive: true,
    ...(categoryOr.length ? { $or: categoryOr } : {}),
  };

  const [rawProducts, suppliers, categories, rfqs] = await Promise.all([
    Product.find(productQuery)
      .select('name slug category subcategory price currency minimumOrderQuantity unit images averageRating totalOrders sellerId tags description specifications sampleAvailable samplePrice leadTime')
      .populate('sellerId', 'companyName isVerified rating trustScore address companyType')
      .sort({ averageRating: -1, totalOrders: -1, createdAt: -1 })
      .limit(productLimit)
      .lean()
      .exec(),
    Seller.find(sellerQuery)
      .select('companyName companyType companyDescription address isVerified trustScore rating productCategories exportMarkets userId')
      .populate('userId', 'fullName')
      .sort({ isVerified: -1, trustScore: -1, rating: -1, createdAt: -1 })
      .limit(supplierLimit)
      .lean()
      .exec(),
    Category.find(categoryQuery)
      .select('name slug description image metadata')
      .sort({ 'metadata.isFeatured': -1, 'metadata.sortOrder': 1, name: 1 })
      .limit(categoryLimit)
      .lean()
      .exec(),
    RFQ.find(rfqQuery)
      .select('title description category subcategory quantity unit targetPrice currency deliveryCountry status quotationCount createdAt')
      .sort({ createdAt: -1 })
      .limit(rfqLimit)
      .lean()
      .exec(),
  ]);

  const products = rawProducts;

  let quotations = [];
  let orders = [];

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
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

  const services = listServices()
    .filter(service => publicServiceLink(service))
    .filter(service => {
      if (!regex) return true;
      return [service.key, service.title, service.description, ...(service.requirements || []), ...(service.benefits || [])]
        .filter(Boolean)
        .some(value => new RegExp(regex, 'i').test(String(value)));
    })
    .slice(0, 8);

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
    categories,
    countries,
    services,
    rfqs,
    quotations,
    orders,
  };
}

export function summarizeMarketplaceResults(results) {
  const productCategories = [...new Set((results.products || []).map(p => p.category).filter(Boolean))].slice(0, 4);
  const supplierLocations = [...new Set((results.suppliers || []).map(s => s.address?.country || s.address?.state).filter(Boolean))].slice(0, 4);

  const promptProductLimit = Number(process.env.AI_PROMPT_PRODUCT_LIMIT || 4);
  const promptSupplierLimit = Number(process.env.AI_PROMPT_SUPPLIER_LIMIT || 4);
  const topProducts = (results.products || []).slice(0, promptProductLimit).map(product =>
    `- Product: ${product.name} | ${product.category || 'General'} | Price ${product.currency || 'INR'} ${product.price || 'request'} | MOQ ${product.minimumOrderQuantity || 1} ${product.unit || 'units'} | Supplier ${product.sellerId?.companyName || 'Supplier'}${product.sellerId?.isVerified ? ' verified' : ''} | Link ${publicProductLink(product)}${product.sellerId?._id ? ` | Supplier link ${publicSupplierLink(product.sellerId)}` : ''}`
  );

  const topSuppliers = (results.suppliers || []).slice(0, promptSupplierLimit).map(seller =>
    `- Supplier: ${seller.companyName || 'Supplier'} | ${seller.companyType || 'supplier'} | ${seller.address?.country || 'Global'} | Trust ${seller.trustScore || 0} | ${seller.isVerified ? 'Verified' : 'Not verified'} | Link ${publicSupplierLink(seller)}`
  );

  const topCategories = (results.categories?.length ? results.categories : productCategories.map(name => ({ name })))
    .slice(0, 8).map(cat => `- Category: ${cat.name} | Link ${publicCategoryLink(cat)}`);

  const topServices = (results.services || []).slice(0, 6).map(service =>
    `- Service: ${service.title} | Link ${publicServiceLink(service)}`
  );

  const topRfqs = (results.rfqs || []).slice(0, 3).map(rfq =>
    `- RFQ: ${rfq.title} | ${rfq.category || 'General'} | Quantity ${rfq.quantity || 'request'} ${rfq.unit || ''} | Link ${publicRfqLink(rfq)}`
  );

  const topQuotations = (results.quotations || []).slice(0, 3).map(q =>
    `- Quotation: ${q.rfqId?.title || q.productId?.name || 'Quotation'} | ${q.currency || 'INR'} ${q.unitPrice || q.totalPrice || 'request'} | MOQ ${q.minimumOrderQuantity || 'request'} | Status ${q.status || 'pending'} | Account link /dashboard/buyer/quotations/${q._id}`
  );

  const topOrders = (results.orders || []).slice(0, 4).map(order =>
    `- Order: ${order.orderNumber || order._id} | ${order.status || 'pending'} | Payment ${order.paymentStatus || 'pending'} | Total ${order.currency || 'INR'} ${order.totalAmount || order.totalPrice || 0} | Buyer link ${accountOrderLink(order, 'buyer')} | Seller link ${accountOrderLink(order, 'seller')}`
  );

  return [
    `${results.products?.length || 0} products`,
    `${results.suppliers?.length || 0} suppliers`,
    `${results.manufacturers?.length || 0} manufacturers`,
    `${results.categories?.length || 0} categories`,
    `${results.services?.length || 0} services`,
    `${results.countries?.length || 0} countries`,
    `${results.rfqs?.length || 0} RFQs`,
    `${results.quotations?.length || 0} quotations`,
    `${results.orders?.length || 0} orders`,
    productCategories.length ? `categories: ${productCategories.join(', ')}` : '',
    supplierLocations.length ? `locations: ${supplierLocations.join(', ')}` : '',
    results.countries?.length ? `countries: ${results.countries.join(', ')}` : '',
    topProducts.length ? `Actionable products:\n${topProducts.join('\n')}` : '',
    topSuppliers.length ? `Actionable suppliers:\n${topSuppliers.join('\n')}` : '',
    topCategories.length ? `Actionable categories:\n${topCategories.join('\n')}` : '',
    topServices.length ? `Actionable services:\n${topServices.join('\n')}` : '',
    topRfqs.length ? `Actionable RFQs:\n${topRfqs.join('\n')}` : '',
    topQuotations.length ? `Actionable quotations:\n${topQuotations.join('\n')}` : '',
    topOrders.length ? `Actionable orders:\n${topOrders.join('\n')}` : '',
  ].filter(Boolean).join('\n');
}
