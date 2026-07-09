import mongoose from 'mongoose';
import * as supplierService from '../services/supplier.service.js';
import * as supplierRepository from '../repositories/supplier.repository.js';
import { storeUpload } from '../lib/storage.js';
import { UPLOAD, ALLOWED_DOCUMENT_TYPES_SET } from '../lib/constants.js';
import { invalidateMemoryCache } from '../lib/cache.js';
import { toPositiveInt, sellerSortField } from '../lib/supplier-helpers.js';
import {
  factorySchema,
  onboardingSchema,
  onboardingDraftSchema,
} from '../validators/supplier.validator.js';
import crypto from 'crypto';

function invalidateSupplierCaches(sellerId) {
  invalidateMemoryCache('sellers:');
  if (sellerId) invalidateMemoryCache(`supplier-profile:${sellerId}`);
}

// ─── Seller Listing ────────────────────────────────────────
export async function getSellers(req, res, next) {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 20, 60);

    const searchParams = {
      page,
      limit,
      search: req.query.search || '',
      companyType: req.query.companyType,
      isVerified: req.query.isVerified,
      minRating: req.query.minRating,
      minTrustScore: req.query.minTrustScore,
      hasProducts: req.query.hasProducts,
      region: req.query.region,
      yearEstablished: req.query.yearEstablished,
      sort: req.query.sort || 'rating',
      order: req.query.order || 'desc',
    };

    const payload = await supplierService.getSellers(searchParams);

    const cacheControl = req.query.search
      ? 'public, s-maxage=20, stale-while-revalidate=120'
      : 'public, s-maxage=60, stale-while-revalidate=300';

    res.set('Cache-Control', cacheControl);
    return res.json(payload);
  } catch (error) {
    console.error('Fetch sellers error:', error);
    return res.status(500).json({ error: 'Unable to fetch sellers' });
  }
}

// ─── Factory Profile ───────────────────────────────────────
export async function getFactoryProfile(req, res) {
  const user = req.user;

  if (!user?.roles?.includes('seller')) {
    return res.status(403).json({ error: 'Seller access required' });
  }

  if (!mongoose.Types.ObjectId.isValid(user.id)) {
    return res.status(404).json({ error: 'Seller profile not found' });
  }

  const factory = await supplierService.getFactoryProfile(user);

  return res.json({ factory });
}

export async function saveFactoryProfile(req, res, next) {
  try {
    const user = req.user;

    if (!user?.roles?.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const data = factorySchema.parse(req.body);
    const factory = await supplierService.saveFactoryProfile(user, data);

    const seller = await supplierRepository.findSellerByUserId(user.id);
    invalidateSupplierCaches(seller?._id);

    return res.json({ factory });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({ error: 'Invalid factory profile' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Factory profile error:', error);
    return res.status(500).json({ error: 'Unable to save factory profile' });
  }
}

export async function saveFactoryDraft(req, res, next) {
  try {
    const user = req.user;

    if (!user?.roles?.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const data = factorySchema.parse(req.body);
    const result = await supplierService.saveFactoryDraft(user, data);

    const seller = await supplierRepository.findSellerByUserId(user.id);
    invalidateSupplierCaches(seller?._id);

    return res.json({
      success: true,
      factory: result.factory,
      draftSavedAt: result.draftSavedAt,
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({ error: 'Invalid factory draft' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Factory draft error:', error);
    return res.status(500).json({ error: 'Unable to save factory draft' });
  }
}

// ─── Onboarding ────────────────────────────────────────────
export async function getOnboarding(req, res) {
  try {
    const user = req.user;

    if (!user?.id || !user.roles.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const result = await supplierService.getOnboarding(user);

    return res.json(result);
  } catch (error) {
    console.error('Seller onboarding fetch error:', error);
    return res.status(500).json({ error: 'Unable to load onboarding details' });
  }
}

export async function saveOnboardingDraft(req, res, next) {
  try {
    const user = req.user;

    if (!user?.id || !user.roles.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const data = onboardingDraftSchema.parse(req.body);
    const result = await supplierService.saveOnboardingDraft(user, data);

    invalidateSupplierCaches(result.seller._id);

    return res.json({
      success: true,
      seller: result.seller,
      draftSavedAt: result.draftSavedAt,
      completion: result.completion,
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({ error: 'Invalid onboarding draft' });
    }
    console.error('Seller onboarding draft error:', error);
    return res.status(500).json({ error: 'Unable to save onboarding draft' });
  }
}

export async function submitOnboarding(req, res, next) {
  try {
    const user = req.user;

    if (!user?.id || !user.roles.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const data = onboardingSchema.parse(req.body);
    const result = await supplierService.submitOnboarding(user, data);

    invalidateSupplierCaches(result.sellerId);

    return res.json({
      success: true,
      sellerId: result.sellerId,
      redirectTo: result.redirectTo,
    });
  } catch (error) {
    if (error.name === 'ZodError') {
      return res.status(422).json({ error: 'Please complete all required business details' });
    }
    console.error('Seller onboarding error:', error);
    return res.status(500).json({ error: 'Unable to save onboarding details' });
  }
}

// ─── Document Download ─────────────────────────────────────
export async function downloadDocument(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { documentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const verification = await supplierRepository.findVerificationByDocumentId(documentId);
    if (!verification) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const ownsDocument = verification.userId.toString() === user.id;
    if (!ownsDocument && !user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const document = verification.documents.id(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Redirect for cloudinary documents
    if (document.storageProvider === 'cloudinary' && document.url) {
      return res.redirect(document.url);
    }

    // For local files (if any exist)
    return res.status(404).json({ error: 'Document file is unavailable' });
  } catch (error) {
    console.error('Document download error:', error);
    return res.status(500).json({ error: 'Unable to retrieve document' });
  }
}

// ─── Document Upload ───────────────────────────────────────
export async function uploadDocument(req, res, next) {
  try {
    const user = req.user;

    if (!user?.roles?.includes('seller')) {
      return res.status(403).json({ error: 'Seller access required' });
    }

    const file = req.file;
    const documentType = req.body.documentType || '';

    if (!file || !ALLOWED_DOCUMENT_TYPES_SET.has(documentType)) {
      return res.status(422).json({ error: 'Valid file and document type are required' });
    }

    if (file.size > UPLOAD.MAX_FILE_SIZE) {
      return res.status(413).json({ error: 'File exceeds the 5MB limit' });
    }

    const isFactoryVideo =
      documentType === 'factory_video' && file.mimetype.startsWith('video/');

    if (!UPLOAD.ALLOWED_DOCUMENT_TYPES.includes(file.mimetype) && !isFactoryVideo) {
      return res.status(415).json({ error: 'Unsupported file type' });
    }

    const { seller } = await supplierService.uploadVerificationDocument(
      user,
      file,
      documentType
    );

    const stored = await storeUpload(
      {
        arrayBuffer: async () => file.buffer,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
      },
      `verification/${seller._id}`,
      { visibility: 'private' }
    );

    const checksum = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    const verification = await supplierService.saveDocumentRecord(
      seller._id,
      user.id,
      {
        type: documentType,
        name: file.originalname,
        url: stored.url,
        status: 'pending',
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        size: stored.size,
        checksum,
      }
    );

    const document = verification.documents.at(-1);
    document.url = `/api/seller/verification/documents/${document._id}`;
    await verification.save();

    // Update seller status
    const Seller = (await import('../models/Seller.js')).default;
    await Seller.findByIdAndUpdate(seller._id, {
      $set: {
        verificationStatus: 'document_submitted',
        isVerified: false,
        verificationBadge: 'inactive',
      },
    });

    await supplierService.createDocumentAudit(
      verification._id,
      seller._id,
      user.id,
      documentType,
      file.originalname,
      checksum
    );

    return res.json({ success: true, document });
  } catch (error) {
    console.error('Verification document upload error:', error);
    return res.status(500).json({ error: 'Unable to upload verification document' });
  }
}