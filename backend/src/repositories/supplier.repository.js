import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import FactoryProfile from '../models/FactoryProfile.js';
import SellerVerification from '../models/SellerVerification.js';
import VerificationAudit from '../models/VerificationAudit.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';

// ─── Seller Listing ────────────────────────────────────────
export async function findSellersAggregated(query, sortQuery, page, limit) {
  const [result] = await Seller.aggregate([
    { $match: query },
    { $sort: sortQuery },
    {
      $facet: {
        sellers: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
              pipeline: [{ $project: { fullName: 1, avatarUrl: 1 } }],
            },
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              userId: '$user',
              companyName: 1,
              companyType: 1,
              companyDescription: 1,
              companyLogo: 1,
              logo: 1,
              logoUrl: 1,
              isVerified: 1,
              isTrustedSeller: 1,
              trustedSellerBadge: 1,
              verificationLevel: 1,
              rating: 1,
              reviewCount: 1,
              responseRate: 1,
              trustScore: 1,
              address: 1,
              yearEstablished: 1,
              totalProducts: 1,
              totalOrders: 1,
              certifications: 1,
              productCategories: 1,
              exportMarkets: 1,
              createdAt: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const sellers = result?.sellers || [];
  const total = result?.total?.[0]?.count || 0;

  return {
    sellers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

export async function findPublicSellerById(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) return null;

  return Seller.findOne({
    _id: sellerId,
    isActive: true,
    isSuspended: { $ne: true },
  })
    .select('userId companyName companyType companyDescription companyLogo logo logoUrl companyWebsite yearEstablished employeeCount gstNumber panNumber businessRegistrationNumber importExportCode businessEmail businessPhone address shippingInfo isVerified isTrustedSeller trustedSellerBadge verificationStatus verificationLevel rating reviewCount responseRate trustScore totalProducts totalOrders certifications productCategories exportMarkets createdAt')
    .populate('userId', 'fullName avatarUrl')
    .lean()
    .exec();
}

export async function findPublicSellerRelatedData(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return { products: [], factoryProfile: null, reviews: [] };
  }

  const [products, factoryProfile, reviews] = await Promise.all([
    Product.find({
      sellerId,
      status: { $in: ['active', 'published'] },
    })
      .select('name slug images image price minPrice maxPrice currency minimumOrderQuantity moq unit category subcategory averageRating reviewCount totalOrders priceTiers variants sampleAvailable samplePrice leadTime createdAt')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean(),
    FactoryProfile.findOne({ sellerId })
      .select('name address floorArea description employeeCount productionLines machinery monthlyCapacity annualCapacity capabilities qualityControl images videos certifications verificationStatus inspectedAt')
      .lean(),
    Review.find({ sellerId, status: 'published' })
      .populate('userId', 'fullName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  return { products, factoryProfile, reviews };
}

// ─── Factory Profile ───────────────────────────────────────
export async function findSellerWithFactory(userId) {
  const [sellerFactory] = await Seller.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $project: { _id: 1 } },
    {
      $lookup: {
        from: 'factoryprofiles',
        localField: '_id',
        foreignField: 'sellerId',
        as: 'factory',
        pipeline: [
          {
            $project: {
              sellerId: 1,
              name: 1,
              address: 1,
              floorArea: 1,
              description: 1,
              employeeCount: 1,
              productionLines: 1,
              machinery: 1,
              monthlyCapacity: 1,
              annualCapacity: 1,
              capabilities: 1,
              qualityControl: 1,
              images: 1,
              videos: 1,
              verificationStatus: 1,
              lastDraftSavedAt: 1,
              inspectedAt: 1,
              updatedAt: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    { $project: { factory: { $first: '$factory' } } },
  ]);

  return sellerFactory?.factory || null;
}

export async function findSellerByUserId(userId) {
  return Seller.findOne({ userId }).select('_id').lean().exec();
}

export async function upsertFactoryProfile(sellerId, data) {
  return FactoryProfile.findOneAndUpdate(
    { sellerId },
    { $set: { ...data, sellerId, verificationStatus: 'pending_review' } },
    { upsert: true, new: true, runValidators: true }
  ).exec();
}

export async function findFactoryProfile(sellerId, selectFields = 'verificationStatus') {
  return FactoryProfile.findOne({ sellerId }).select(selectFields).lean().exec();
}

export async function upsertFactoryDraft(sellerId, data, status) {
  return FactoryProfile.findOneAndUpdate(
    { sellerId },
    {
      $set: {
        ...data,
        sellerId,
        verificationStatus: status,
        lastDraftSavedAt: new Date(),
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).exec();
}

// ─── Onboarding ────────────────────────────────────────────
export async function findSellerWithVerification(userId) {
  const sellerRows = mongoose.Types.ObjectId.isValid(userId)
    ? await Seller.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $lookup: {
            from: 'sellerverifications',
            localField: '_id',
            foreignField: 'sellerId',
            as: 'verification',
            pipeline: [{ $limit: 1 }],
          },
        },
        { $set: { verification: { $first: '$verification' } } },
      ])
    : [];

  const seller = sellerRows[0] || null;
  const verification = seller?.verification || null;
  if (seller) delete seller.verification;

  return { seller, verification };
}

export async function findExistingSeller(userId) {
  return Seller.findOne({ userId }).lean().exec();
}

export async function upsertSellerOnboarding(userId, data, status, additionalFields = {}) {
  return Seller.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        ...data,
        verificationStatus: status,
        isActive: true,
        ...additionalFields,
      },
    },
    { upsert: true, new: true }
  ).exec();
}

export async function findExistingVerification(sellerId) {
  return SellerVerification.findOne({ sellerId }).lean().exec();
}

export async function upsertVerificationRecord(sellerId, userId, updateData) {
  return SellerVerification.findOneAndUpdate(
    { sellerId },
    { $set: updateData },
    { upsert: true, new: true }
  ).exec();
}

// ─── Documents ─────────────────────────────────────────────
export async function findVerificationByDocumentId(documentId) {
  return SellerVerification.findOne({ 'documents._id': documentId }).exec();
}

export async function addDocumentToVerification(sellerId, userId, documentData) {
  return SellerVerification.findOneAndUpdate(
    { sellerId },
    {
      $set: {
        sellerId,
        userId,
        status: 'document_submitted',
        submittedAt: new Date(),
      },
      $push: {
        documents: documentData,
      },
    },
    { upsert: true, new: true }
  ).exec();
}

export async function createAuditLog(auditData) {
  return VerificationAudit.create(auditData);
}
