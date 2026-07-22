import { cached } from '../lib/cache.js';
import { getSellerCompletionSummary } from '../lib/seller-verification.js';
import { buildVerificationCenterSummary } from '../lib/verification-center.js';
import { buildSellerQuery, sellerSortField, stripUndefined } from '../lib/supplier-helpers.js';
import * as supplierRepository from '../repositories/supplier.repository.js';

const PROTECTED_SELLER_STATUSES = new Set([
  'document_submitted',
  'submitted',
  'document_review',
  'info_requested',
  'manual_verification',
  'under_review',
  'approved',
  'rejected',
  'additional_information_required',
  'factory_inspection_scheduled',
  'expired',
  'reverification_required',
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
  const [seller, related] = await Promise.all([
    supplierRepository.findPublicSellerById(sellerId),
    supplierRepository.findPublicSellerRelatedData(sellerId),
  ]);
  if (!seller) {
    const error = new Error('Supplier not found');
    error.statusCode = 404;
    throw error;
  }
  return { seller, ...related };
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

  const verification = await supplierRepository.findExistingVerification(seller._id);
  if (verification) {
    await supplierRepository.upsertVerificationRecord(seller._id, user.id, {
      stepData: { ...(verification.stepData || {}), factory: { ...data, factoryProfileId: factory._id } },
      lastSavedAt: new Date(),
    });
  }

  return { factory, draftSavedAt: factory.lastDraftSavedAt };
}

// ─── Onboarding ────────────────────────────────────────────
export async function getOnboarding(user) {
  const { seller, verification } = await supplierRepository.findSellerWithVerification(user.id);

  const draftAvailable = Boolean(
    seller?.onboardingDraftSavedAt && !user.hasCompletedOnboarding
  );

  const [factory, timeline, subscription] = await Promise.all([
    seller ? supplierRepository.findFactoryProfile(seller._id, '') : null,
    verification ? supplierRepository.listVerificationAudit(verification._id) : [],
    import('../models/Subscription.js').then(({ default: Subscription }) => Subscription.findOne({ userId: user.id }).lean()),
  ]);
  const completion = seller ? getSellerCompletionSummary(seller) : null;
  const verificationCenter = buildVerificationCenterSummary(seller, verification);
  return { seller, verification, factory, subscription, timeline, completion, verificationCenter, draftAvailable };
}

export async function saveOnboardingDraft(user, data) {
  const { verificationCenter: centerInput, ...sellerInput } = data;
  const cleaned = stripUndefined(sellerInput);
  const now = new Date();

  const existingSeller = await supplierRepository.findExistingSeller(user.id);

  const sellerStatus = centerInput?.submitForReview ? 'submitted' : PROTECTED_SELLER_STATUSES.has(existingSeller?.verificationStatus)
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

  const verificationStatus = existingVerification?.status && PROTECTED_SELLER_STATUSES.has(existingVerification.status)
    ? existingVerification.status
    : existingVerification?.documents?.length
      ? 'document_submitted'
      : 'pending';
  const requestedStatus = centerInput?.submitForReview ? 'submitted' : verificationStatus;

  const verification = await supplierRepository.upsertVerificationRecord(seller._id, user.id, {
    sellerId: seller._id,
    userId: user.id,
    status: requestedStatus,
    onboardingCompleted: Boolean(user.hasCompletedOnboarding && completion.isComplete),
    completedFields: completion.completedFields,
    remainingFields: completion.remainingFields,
    completedFieldCount: completion.completedCount,
    totalFieldCount: completion.totalCount,
    ...(centerInput ? {
      currentStep: centerInput.currentStep,
      completedSteps: centerInput.completedSteps,
      stepData: centerInput.stepData,
      lastSavedAt: now,
    } : {}),
  });

  const centerSummary = buildVerificationCenterSummary(seller, verification);
  await supplierRepository.upsertVerificationRecord(seller._id, user.id, {
    completedSteps: centerSummary.completedSteps,
    rejectedSteps: centerSummary.rejectedSteps,
    businessScore: centerSummary.businessScore,
    tradeReadinessScore: centerSummary.tradeReadinessScore,
    serviceReadinessScore: centerSummary.serviceReadinessScore,
    overallTrustScore: centerSummary.overallTrustScore,
    verificationScore: centerSummary.overallTrustScore,
    verificationLevel: centerSummary.verificationLevel,
  });

  await supplierRepository.updateSellerById(seller._id, {
    trustScore: centerSummary.overallTrustScore,
    verificationLevel: centerSummary.verificationLevel,
  });

  const Notification = (await import('../models/Notification.js')).default;
  const notifications = [];
  if (centerInput?.submitForReview) notifications.push({ userId: user.id, notificationType: 'verification_started', title: 'Verification submitted', description: 'Your seller verification is ready for review.', data: { verificationId: verification._id } });
  if (centerSummary.overallTrustScore > Number(existingVerification?.overallTrustScore || 0)) notifications.push({ userId: user.id, notificationType: 'trust_score_increased', title: 'Trust score increased', description: `Your trust score is now ${centerSummary.overallTrustScore}.`, data: { score: centerSummary.overallTrustScore } });
  if (centerSummary.verificationLevel > Number(existingVerification?.verificationLevel || 0)) notifications.push({ userId: user.id, notificationType: 'verification_level_increased', title: 'Verification level increased', description: `You reached ${centerSummary.currentLevel}.`, data: { level: centerSummary.verificationLevel } });
  if (notifications.length) await Notification.insertMany(notifications);

  if (centerInput?.submitForReview) {
    await supplierRepository.createAuditLog({ verificationId: verification._id, sellerId: seller._id, actorId: user.id, action: 'profile_submitted', fromStatus: existingVerification?.status || 'draft', toStatus: 'submitted' });
  }

  return { seller, completion, verificationCenter: centerSummary, draftSavedAt: now.toISOString() };
}

export async function reviewVerificationApplication(admin, verificationId, input) {
  const allowed = new Set(['under_review', 'additional_information_required', 'factory_inspection_scheduled', 'approved', 'rejected', 'expired', 'reverification_required']);
  if (!allowed.has(input.status)) {
    const error = new Error('Invalid verification status'); error.statusCode = 422; throw error;
  }
  const verification = await supplierRepository.findVerificationById(verificationId);
  if (!verification) { const error = new Error('Verification not found'); error.statusCode = 404; throw error; }
  if (['additional_information_required', 'rejected', 'reverification_required'].includes(input.status) && !String(input.notes || '').trim()) {
    const error = new Error('Reviewer notes are required for this status'); error.statusCode = 422; throw error;
  }
  const previousStatus = verification.status;
  verification.status = input.status;
  verification.reviewedAt = new Date();
  verification.reviewedBy = admin.id;
  verification.adminNotes = String(input.notes || '').slice(0, 4000);
  if (input.status === 'rejected') verification.rejectionReason = verification.adminNotes;
  if (input.status === 'factory_inspection_scheduled') verification.inspectionScheduledAt = new Date(input.inspectionScheduledAt);
  if (input.status === 'approved') {
    verification.verifiedAt = new Date();
    verification.verificationExpiresAt = input.verificationExpiresAt ? new Date(input.verificationExpiresAt) : new Date(Date.now() + 365 * 86400000);
    verification.assessmentReportUrl = input.assessmentReportUrl || verification.assessmentReportUrl;
    verification.publicVerificationVideoUrl = input.publicVerificationVideoUrl || verification.publicVerificationVideoUrl;
  }
  await verification.save();
  const sellerUpdate = { verificationStatus: input.status, isVerified: input.status === 'approved', verificationBadge: input.status === 'approved' ? 'active' : input.status === 'expired' ? 'expired' : 'inactive' };
  if (input.status === 'approved') Object.assign(sellerUpdate, { verificationDate: new Date(), verificationExpiresAt: verification.verificationExpiresAt });
  await supplierRepository.updateSellerById(verification.sellerId, sellerUpdate);
  const factory = await supplierRepository.findFactoryProfile(verification.sellerId, 'verificationStatus');
  if (factory && input.status === 'factory_inspection_scheduled') {
    const FactoryProfile = (await import('../models/FactoryProfile.js')).default;
    await FactoryProfile.findOneAndUpdate({ sellerId: verification.sellerId }, { $set: { verificationStatus: 'inspection_scheduled', 'inspection.scheduledAt': verification.inspectionScheduledAt, 'inspection.notes': verification.adminNotes } });
  }
  const action = input.status === 'approved' ? 'verification_approved' : input.status === 'rejected' ? 'verification_rejected' : input.status === 'factory_inspection_scheduled' ? 'factory_inspection_scheduled' : input.status === 'reverification_required' ? 'reverification_requested' : 'status_changed';
  await supplierRepository.createAuditLog({ verificationId: verification._id, sellerId: verification.sellerId, actorId: admin.id, action, fromStatus: previousStatus, toStatus: input.status, notes: verification.adminNotes, metadata: { inspectionScheduledAt: verification.inspectionScheduledAt } });
  const Notification = (await import('../models/Notification.js')).default;
  await Notification.create({ userId: verification.userId, notificationType: input.status === 'approved' ? 'verification_approved' : 'verification_under_review', title: `Verification ${input.status.replaceAll('_', ' ')}`, description: verification.adminNotes || 'Your verification status has changed.', data: { verificationId, status: input.status } });
  return { verification, timeline: await supplierRepository.listVerificationAudit(verification._id) };
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
  const existing = await supplierRepository.findExistingVerification(sellerId);
  const duplicate = existing?.documents?.find(document => document.checksum && document.checksum === documentData.checksum && document.status !== 'archived');
  if (duplicate) {
    const error = new Error('This file has already been uploaded');
    error.statusCode = 409;
    throw error;
  }
  const previous = [...(existing?.documents || [])].reverse().find(document => document.type === documentData.type && document.status !== 'archived');
  return supplierRepository.addDocumentToVerification(sellerId, userId, {
    ...documentData,
    version: Number(previous?.version || 0) + 1,
    reuploadCount: Number(previous?.reuploadCount || 0) + (previous ? 1 : 0),
    supersedesDocumentId: previous?._id,
  });
}

export async function archiveVerificationDocument(user, documentId) {
  const verification = await supplierRepository.findVerificationByDocumentId(documentId);
  if (!verification || String(verification.userId) !== String(user.id)) {
    const error = new Error('Document not found');
    error.statusCode = 404;
    throw error;
  }
  const document = verification.documents.id(documentId);
  if (!document) {
    const error = new Error('Document not found');
    error.statusCode = 404;
    throw error;
  }
  const previousStatus = document.status;
  document.status = 'archived';
  document.archivedAt = new Date();
  await verification.save();
  await supplierRepository.createAuditLog({ verificationId: verification._id, sellerId: verification.sellerId, actorId: user.id, action: 'document_archived', fromStatus: previousStatus, toStatus: 'archived', metadata: { documentId } });
  return { documentId, status: 'archived' };
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

export async function listVerificationReviews(query = {}) {
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.sellerId) filter.sellerId = query.sellerId;
  if (query.level !== undefined && query.level !== '') filter.verificationLevel = Number(query.level);
  if (query.search) filter.$text = { $search: String(query.search).slice(0, 100) };
  return supplierRepository.listVerificationRecords(filter, query.limit);
}

export async function reviewVerificationDocument(admin, documentId, input) {
  const allowed = new Set(['under_review', 'verified', 'rejected', 'needs_update']);
  if (!allowed.has(input.status)) {
    const error = new Error('Invalid document review status'); error.statusCode = 422; throw error;
  }
  if (['rejected', 'needs_update'].includes(input.status) && !String(input.reason || input.notes || '').trim()) {
    const error = new Error('A rejection reason or reviewer note is required'); error.statusCode = 422; throw error;
  }
  const verification = await supplierRepository.findVerificationByDocumentId(documentId);
  if (!verification) { const error = new Error('Document not found'); error.statusCode = 404; throw error; }
  const document = verification.documents.id(documentId);
  const previousStatus = document.status;
  document.status = input.status;
  document.rejectionReason = ['rejected', 'needs_update'].includes(input.status) ? String(input.reason || input.notes) : undefined;
  document.reviewerNotes = input.notes ? String(input.notes).slice(0, 2000) : undefined;
  document.verifiedBy = admin.id;
  document.verifiedAt = input.status === 'verified' ? new Date() : undefined;
  verification.reviewedAt = new Date(); verification.reviewedBy = admin.id;
  verification.status = input.status === 'under_review' ? 'document_review' : input.status === 'verified' ? 'under_review' : 'info_requested';
  await verification.save();
  const Seller = (await import('../models/Seller.js')).default;
  const seller = await Seller.findById(verification.sellerId);
  const summary = buildVerificationCenterSummary(seller, verification);
  Object.assign(verification, { completedSteps: summary.completedSteps, rejectedSteps: summary.rejectedSteps, businessScore: summary.businessScore, tradeReadinessScore: summary.tradeReadinessScore, serviceReadinessScore: summary.serviceReadinessScore, overallTrustScore: summary.overallTrustScore, verificationScore: summary.overallTrustScore, verificationLevel: summary.verificationLevel });
  await verification.save();
  if (seller) { seller.trustScore = summary.overallTrustScore; seller.verificationLevel = summary.verificationLevel; seller.verificationStatus = verification.status; await seller.save(); }
  await supplierRepository.createAuditLog({ verificationId: verification._id, sellerId: verification.sellerId, actorId: admin.id, action: input.status === 'verified' ? 'document_approved' : input.status === 'needs_update' ? 'document_needs_update' : input.status === 'rejected' ? 'document_rejected' : 'information_requested', fromStatus: previousStatus, toStatus: input.status, notes: input.notes || input.reason, metadata: { documentId } });
  const Notification = (await import('../models/Notification.js')).default;
  const notificationType = input.status === 'verified' ? 'document_verified' : input.status === 'under_review' ? 'verification_under_review' : input.status === 'needs_update' ? 'verification_needs_update' : 'document_rejected';
  await Notification.create({ userId: verification.userId, notificationType, title: input.status === 'verified' ? 'Document verified' : input.status === 'under_review' ? 'Verification review started' : 'Verification document needs attention', description: input.notes || input.reason || `Your ${document.name} status changed to ${input.status}.`, data: { verificationId: verification._id, documentId, status: input.status } });
  return { verification, document, verificationCenter: summary };
}
