import { cached } from '../lib/cache.js';
import { getSellerCompletionSummary } from '../lib/seller-verification.js';
import { buildSellerQuery, sellerSortField, stripUndefined } from '../lib/supplier-helpers.js';
import * as supplierRepository from '../repositories/supplier.repository.js';

const PROTECTED_SELLER_STATUSES = new Set([
  'document_submitted',
  'document_review',
  'info_requested',
  'manual_verification',
  'under_review',
  'approved',
  'rejected',
]);

const PROTECTED_FACTORY_STATUSES = new Set([
  'submitted',
  'under_review',
  'pending_review',
  'approved',
  'verified',
  'rejected',
]);

// ─── Seller Listing ────────────────────────────────────────
export async function getSellers(searchParams) {
  const page = searchParams.page;
  const limit = searchParams.limit;
  const sort = searchParams.sort || 'rating';
  const order = searchParams.order === 'asc' ? 1 : -1;

  const query = buildSellerQuery(searchParams);
  const sortField = sellerSortField(sort === 'newest' ? 'createdAt' : sort);
  const sortQuery = {
    isTrustedSeller: -1,
    isVerified: -1,
    [sortField]: order,
    createdAt: -1,
  };

  const cacheKey = `sellers:${JSON.stringify(searchParams)}`;
  const payload = await cached(
    cacheKey,
    searchParams.search ? 20000 : 60000,
    () => supplierRepository.findSellersAggregated(query, sortQuery, page, limit)
  );

  return payload;
}

export async function getSellerDetails(sellerId) {
  const seller = await supplierRepository.findPublicSellerById(sellerId);
  if (!seller) {
    const error = new Error('Supplier not found');
    error.statusCode = 404;
    throw error;
  }
  return { seller };
}

// ─── Factory Profile ───────────────────────────────────────
export async function getFactoryProfile(user) {
  return supplierRepository.findSellerWithFactory(user.id);
}

export async function saveFactoryProfile(user, data) {
  const seller = await supplierRepository.findSellerByUserId(user.id);
  if (!seller) {
    const error = new Error('Seller profile not found');
    error.statusCode = 404;
    throw error;
  }

  const factory = await supplierRepository.upsertFactoryProfile(seller._id, data);

  return factory;
}

export async function saveFactoryDraft(user, data) {
  const seller = await supplierRepository.findSellerByUserId(user.id);
  if (!seller) {
    const error = new Error('Seller profile not found');
    error.statusCode = 404;
    throw error;
  }

  const existingFactory = await supplierRepository.findFactoryProfile(seller._id);

  const nextStatus = PROTECTED_FACTORY_STATUSES.has(existingFactory?.verificationStatus)
    ? existingFactory.verificationStatus
    : 'draft';

  const factory = await supplierRepository.upsertFactoryDraft(seller._id, data, nextStatus);

  return { factory, draftSavedAt: factory.lastDraftSavedAt };
}

// ─── Onboarding ────────────────────────────────────────────
export async function getOnboarding(user) {
  const { seller, verification } = await supplierRepository.findSellerWithVerification(user.id);

  const draftAvailable = Boolean(
    seller?.onboardingDraftSavedAt && !user.hasCompletedOnboarding
  );

  return { seller, verification, draftAvailable };
}

export async function saveOnboardingDraft(user, data) {
  const cleaned = stripUndefined(data);
  const now = new Date();

  const existingSeller = await supplierRepository.findExistingSeller(user.id);

  const sellerStatus = PROTECTED_SELLER_STATUSES.has(existingSeller?.verificationStatus)
    ? existingSeller.verificationStatus
    : 'pending';

  const seller = await supplierRepository.upsertSellerOnboarding(
    user.id,
    cleaned,
    sellerStatus,
    { onboardingDraftSavedAt: now }
  );

  const completion = getSellerCompletionSummary(seller);

  const existingVerification = await supplierRepository.findExistingVerification(seller._id);

  const verificationStatus = existingVerification?.documents?.length
    ? 'document_submitted'
    : existingVerification?.status && PROTECTED_SELLER_STATUSES.has(existingVerification.status)
      ? existingVerification.status
      : 'pending';

  await supplierRepository.upsertVerificationRecord(seller._id, user.id, {
    sellerId: seller._id,
    userId: user.id,
    status: verificationStatus,
    onboardingCompleted: Boolean(user.hasCompletedOnboarding && completion.isComplete),
    completedFields: completion.completedFields,
    remainingFields: completion.remainingFields,
    completedFieldCount: completion.completedCount,
    totalFieldCount: completion.totalCount,
  });

  return { seller, completion, draftSavedAt: now.toISOString() };
}

export async function submitOnboarding(user, data) {
  const seller = await supplierRepository.upsertSellerOnboarding(
    user.id,
    data,
    'under_review',
    { onboardingSubmittedAt: new Date() }
  );

  const completion = getSellerCompletionSummary(seller);

  // Mark user onboarding as complete and ensure seller role
  const User = (await import('../models/User.js')).default;
  await User.findByIdAndUpdate(user.id, {
    $set: {
      hasCompletedOnboarding: true,
      primaryRole: 'seller',
    },
    $addToSet: {
      roles: 'seller',
    },
  });

  const existingVerification = await supplierRepository.findExistingVerification(seller._id);
  const nextStatus = existingVerification?.documents?.length
    ? 'document_submitted'
    : 'pending';

  await supplierRepository.upsertVerificationRecord(seller._id, user.id, {
    sellerId: seller._id,
    userId: user.id,
    status: nextStatus,
    onboardingCompleted: completion.isComplete,
    completedFields: completion.completedFields,
    remainingFields: completion.remainingFields,
    completedFieldCount: completion.completedCount,
    totalFieldCount: completion.totalCount,
  });

  return { sellerId: seller._id, redirectTo: '/dashboard/seller' };
}

// ─── Document Upload ───────────────────────────────────────
export async function uploadVerificationDocument(user, file, documentType) {
  const Seller = (await import('../models/Seller.js')).default;
  const seller = await Seller.findOne({ userId: user.id });

  if (!seller) {
    const error = new Error('Complete company details first');
    error.statusCode = 409;
    throw error;
  }

  return { seller };
}

export async function saveDocumentRecord(sellerId, userId, documentData) {
  return supplierRepository.addDocumentToVerification(sellerId, userId, documentData);
}

export async function createDocumentAudit(verificationId, sellerId, actorId, documentType, filename, checksum) {
  return supplierRepository.createAuditLog({
    verificationId,
    sellerId,
    actorId,
    action: 'document_uploaded',
    toStatus: 'document_submitted',
    metadata: { documentType, filename, checksum },
  });
}
