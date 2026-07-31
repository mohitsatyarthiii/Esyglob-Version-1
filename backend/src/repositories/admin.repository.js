import Category from '../models/Category.js';
import Coupon from '../models/Coupon.js';
import GiftCard from '../models/GiftCard.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import SellerVerification from '../models/SellerVerification.js';
import Subcategory from '../models/Subcategory.js';
import User from '../models/User.js';
import VerificationAudit from '../models/VerificationAudit.js';
import FactoryProfile from '../models/FactoryProfile.js';
import AdminActivity from '../models/AdminActivity.js';
import CouponRedemption from '../models/CouponRedemption.js';
import GiftCardTransaction from '../models/GiftCardTransaction.js';

const resources = {
  users: {
    model: User,
    search: ['fullName', 'firstName', 'lastName', 'email', 'phone'],
    populate: '',
    fields: ['fullName', 'firstName', 'lastName', 'phone', 'roles', 'primaryRole', 'isActive', 'isBanned', 'banReason'],
  },
  sellers: {
    model: Seller,
    search: ['companyName', 'companyType', 'businessEmail', 'businessPhone', 'country'],
    populate: 'userId',
    fields: ['companyName', 'companyType', 'companyDescription', 'businessEmail', 'businessPhone', 'country', 'city', 'status', 'isVerified', 'badges'],
  },
  products: {
    model: Product,
    search: ['name', 'slug', 'category', 'subcategory', 'brand', 'description'],
    populate: 'sellerId userId categoryId subcategoryId',
    fields: ['name', 'categoryId', 'subcategoryId', 'category', 'subcategory', 'price', 'currency', 'status', 'isActive', 'visibility', 'minimumOrderQuantity', 'unit'],
  },
  orders: {
    model: Order,
    search: ['orderNumber', 'status', 'paymentStatus', 'currency'],
    populate: 'buyerId sellerId productId invoiceId shipmentId',
    fields: ['status', 'paymentStatus', 'shippingStatus', 'adminNotes'],
  },
  payments: {
    model: Payment,
    search: ['paymentNumber', 'transactionId', 'gatewayPaymentId', 'status', 'gateway'],
    populate: 'userId orderId',
    fields: ['status', 'adminNotes'],
  },
  categories: {
    model: Category,
    search: ['name', 'slug', 'description'],
    populate: '',
    fields: ['name', 'slug', 'description', 'image', 'icon', 'metadata', 'isActive'],
    create: true,
  },
  subcategories: {
    model: Subcategory,
    search: ['name', 'slug', 'description'],
    populate: 'categoryId',
    fields: ['categoryId', 'name', 'slug', 'description', 'image', 'icon', 'metadata', 'isActive'],
    create: true,
  },
  verifications: {
    model: SellerVerification,
    search: ['status', 'businessInfo.legalName', 'businessInfo.gstin', 'businessInfo.panNumber'],
    populate: 'sellerId userId reviewedBy internalNotes.authorId documents.verifiedBy',
    fields: [],
  },
  coupons: {
    model: Coupon,
    search: ['code', 'name', 'description', 'status'],
    populate: 'sellerId createdBy',
    fields: ['name', 'description', 'discountType', 'value', 'maximumDiscount', 'minimumOrderValue', 'currency', 'scope', 'productIds', 'categoryIds', 'sellerIds', 'manufacturerIds', 'countryCodes', 'currencyCodes', 'firstOrderOnly', 'referralOnly', 'campaignType', 'startsAt', 'expiresAt', 'usageLimit', 'perUserUsageLimit', 'priority', 'stackable', 'stackGroup', 'status'],
  },
  'gift-cards': {
    model: GiftCard,
    search: ['codeLast4', 'label', 'recipientEmail', 'status'],
    populate: 'ownerId purchaserId createdBy',
    fields: ['label', 'status', 'expiresAt'],
  },
  activities: {
    model: AdminActivity,
    search: ['action', 'resource', 'summary', 'reason'],
    populate: 'actorId',
    fields: [],
  },
};

export function resourceConfig(resource) {
  const config = resources[resource];
  if (!config) throw Object.assign(new Error('Unsupported admin resource'), { statusCode: 404 });
  return config;
}

export async function listResource(resource, input = {}) {
  const config = resourceConfig(resource);
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(input.limit) || 25));
  const filter = {};
  if (input.search) {
    const expression = new RegExp(escapeRegExp(String(input.search).slice(0, 100)), 'i');
    filter.$or = config.search.map((field) => ({ [field]: expression }));
  }
  if (input.status && input.status !== 'all') {
    const statusField = resource === 'users' ? (input.status === 'suspended' ? 'isBanned' : 'isActive') : 'status';
    filter[statusField] = resource === 'users' ? input.status !== 'inactive' : input.status;
  }
  if (input.role && resource === 'users') filter.roles = input.role;
  const allowedSort = ['createdAt', 'updatedAt', 'name', 'fullName', 'email', 'companyName', 'slug', 'status', 'isActive', 'amount', 'balance', 'price', 'minimumOrderQuantity', 'totalAmount', 'redemptionCount', 'value', 'orderNumber', 'paymentNumber', 'submittedAt'];
  const sortField = allowedSort.includes(input.sortBy) ? input.sortBy : 'createdAt';
  const sort = { [sortField]: input.sortOrder === 'asc' ? 1 : -1 };
  let query = config.model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean();
  if (config.populate) query = query.populate(config.populate);
  const [items, total] = await Promise.all([query, config.model.countDocuments(filter)]);
  return { items, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getResource(resource, id) {
  const config = resourceConfig(resource);
  let query = config.model.findById(id).lean();
  if (config.populate) query = query.populate(config.populate);
  const item = await query;
  if (!item) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
  if (resource === 'verifications') {
    const [history, factory] = await Promise.all([
      VerificationAudit.find({ verificationId: id }).populate('actorId', 'fullName email').sort({ createdAt: -1 }).lean(),
      FactoryProfile.findOne({ sellerId: item.sellerId?._id || item.sellerId }).lean(),
    ]);
    item.history = history;
    item.factory = factory;
  }
  if (resource === 'categories') {
    item.children = await Subcategory.find({ categoryId: id }).sort({ 'metadata.sortOrder': 1, name: 1 }).lean();
  }
  if (resource === 'coupons') {
    item.redemptions = await CouponRedemption.find({ couponId: id }).populate('userId', 'fullName email').populate('orderId', 'orderNumber').sort({ createdAt: -1 }).limit(100).lean();
  }
  if (resource === 'gift-cards') {
    item.transactions = await GiftCardTransaction.find({ giftCardId: id }).populate('userId', 'fullName email').sort({ createdAt: -1 }).limit(100).lean();
  }
  if (resource === 'users') {
    const [activity, verification] = await Promise.all([
      AdminActivity.find({ resource: 'users', resourceId: id }).populate('actorId', 'fullName email').sort({ createdAt: -1 }).limit(50).lean(),
      SellerVerification.findOne({ userId: id }).sort({ updatedAt: -1 }).select('status sellerFeedback rejectionReason submittedAt reviewedAt verifiedAt').lean(),
    ]);
    item.activity = activity;
    item.verification = verification;
  }
  return item;
}

export async function updateResource(resource, id, payload) {
  const config = resourceConfig(resource);
  const normalized = normalizeResourcePayload(resource, payload);
  const update = Object.fromEntries(config.fields.filter((field) => normalized[field] !== undefined).map((field) => [field, normalized[field]]));
  if (!Object.keys(update).length) throw Object.assign(new Error('No supported fields were provided'), { statusCode: 422 });
  const item = await config.model.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
  if (!item) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
  return item;
}

export async function createResource(resource, payload) {
  const config = resourceConfig(resource);
  if (!config.create) throw Object.assign(new Error('Creation is not supported for this resource'), { statusCode: 405 });
  const normalized = normalizeResourcePayload(resource, payload);
  return config.model.create(Object.fromEntries(config.fields.filter((field) => normalized[field] !== undefined).map((field) => [field, normalized[field]])));
}

export async function deleteResource(resource, id, actorId) {
  const config = resourceConfig(resource);
  if (resource === 'users' && String(id) === String(actorId)) throw Object.assign(new Error('You cannot delete your own admin account'), { statusCode: 409 });
  const item = await config.model.findByIdAndDelete(id).lean();
  if (!item) throw Object.assign(new Error('Record not found'), { statusCode: 404 });
  return item;
}

export async function overview() {
  const [
    totalUsers, buyers, sellers, manufacturers, products, orders, payments,
    pendingVerifications, coupons, giftCards, revenue, recentUsers, recentOrders, recentVerifications,
  ] = await Promise.all([
    User.countDocuments(), User.countDocuments({ roles: 'buyer' }), Seller.countDocuments(),
    Seller.countDocuments({ companyType: 'manufacturer' }), Product.countDocuments(), Order.countDocuments(),
    Payment.countDocuments(), SellerVerification.countDocuments({ status: { $in: ['submitted', 'under_review', 'additional_information_required', 'reverification_required'] } }),
    Coupon.countDocuments(), GiftCard.countDocuments(),
    Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    User.find().sort({ createdAt: -1 }).limit(6).select('fullName email roles isActive createdAt').lean(),
    Order.find().sort({ createdAt: -1 }).limit(6).populate('buyerId', 'fullName email').populate('sellerId', 'companyName').lean(),
    SellerVerification.find({ status: { $in: ['submitted', 'under_review', 'additional_information_required', 'reverification_required'] } }).sort({ updatedAt: -1 }).limit(6).populate('sellerId', 'companyName').lean(),
  ]);
  return {
    metrics: { totalUsers, buyers, sellers, manufacturers, products, orders, payments, revenue: revenue[0]?.amount || 0, pendingVerifications, coupons, giftCards },
    recentUsers, recentOrders, pendingReviews: recentVerifications,
  };
}

export async function createActivity(input) {
  return AdminActivity.create(input);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeResourcePayload(resource, payload) {
  if (resource === 'sellers' && payload.badges !== undefined) {
    if (!payload.badges || typeof payload.badges !== 'object' || Array.isArray(payload.badges)) {
      throw Object.assign(new Error('Seller badges must be an object'), { statusCode: 422 });
    }
    const allowed = ['verifiedSeller', 'premiumSeller', 'trustedSupplier', 'goldSupplier', 'topRated', 'manufacturer', 'exporter', 'fastResponse'];
    return {
      ...payload,
      badges: Object.fromEntries(allowed.map((key) => [key, payload.badges[key] === true])),
    };
  }
  if (resource === 'users') {
    const roles = typeof payload.roles === 'string'
      ? payload.roles.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
      : payload.roles;
    if (roles !== undefined) {
      const allowed = new Set(['buyer', 'seller', 'admin']);
      if (!Array.isArray(roles) || !roles.length || roles.some((role) => !allowed.has(role))) {
        throw Object.assign(new Error('Roles must contain buyer, seller, or admin'), { statusCode: 422 });
      }
      return { ...payload, roles: [...new Set(roles)] };
    }
    return payload;
  }
  if (resource === 'coupons') {
    const normalized = { ...payload };
    for (const field of ['productIds', 'categoryIds', 'sellerIds', 'manufacturerIds', 'countryCodes', 'currencyCodes']) {
      if (typeof normalized[field] === 'string') normalized[field] = normalized[field].split(',').map((value) => value.trim()).filter(Boolean);
    }
    return normalized;
  }
  if (!['categories', 'subcategories'].includes(resource) || !payload.metadata) return payload;
  const metadata = { ...payload.metadata };
  if (typeof metadata.keywords === 'string') {
    metadata.keywords = metadata.keywords.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 30);
  }
  return { ...payload, metadata };
}
