import { Router } from 'express';
import * as supplierController from '../controllers/supplier.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { uploadSingle } from '../middlewares/upload.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  factorySchema,
  onboardingSchema,
  onboardingDraftSchema,
} from '../validators/supplier.validator.js';

const router = Router();

// Public routes
router.get('/', supplierController.getSellers);

router.get(
  '/me',
  authenticate,
  requireAuth,
  requireRole('seller'),
  supplierController.getMySupplierProfile
);

router.patch(
  '/profile',
  authenticate,
  requireAuth,
  requireRole('seller'),
  supplierController.saveSupplierProfile
);

// Document download (authenticated but shared between seller and admin)
router.get(
  '/verification/documents/:documentId',
  authenticate,
  requireAuth,
  supplierController.downloadDocument
);

// Factory profile routes (seller only)
router.get(
  '/factory-profile',
  authenticate,
  requireAuth,
  requireRole('seller'),
  supplierController.getFactoryProfile
);

router.put(
  '/factory-profile',
  authenticate,
  requireAuth,
  requireRole('seller'),
  validate(factorySchema),
  supplierController.saveFactoryProfile
);

router.patch(
  '/factory-profile',
  authenticate,
  requireAuth,
  requireRole('seller'),
  validate(factorySchema),
  supplierController.saveFactoryDraft
);

// Onboarding routes (seller only)
router.get(
  '/onboarding',
  authenticate,
  requireAuth,
  requireRole('seller'),
  supplierController.getOnboarding
);

router.patch(
  '/onboarding',
  authenticate,
  requireAuth,
  requireRole('seller'),
  validate(onboardingDraftSchema),
  supplierController.saveOnboardingDraft
);

router.post(
  '/onboarding',
  authenticate,
  requireAuth,
  requireRole('seller'),
  validate(onboardingSchema),
  supplierController.submitOnboarding
);

// Document upload (seller only)
router.post(
  '/verification/documents',
  authenticate,
  requireAuth,
  requireRole('seller'),
  uploadSingle,
  supplierController.uploadDocument
);

router.get('/:sellerId', supplierController.getSellerDetails);

export default router;
