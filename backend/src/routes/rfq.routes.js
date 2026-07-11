import { Router } from 'express';
import * as rfqController from '../controllers/rfq.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// ===== PUBLIC ROUTES (authenticate sets req.user if logged in) =====

// GET /api/rfqs - List RFQs (supports buyer, seller, public scopes)
router.get('/', authenticate, rfqController.getRfqs);

// GET /api/rfqs/:rfqId - RFQ detail
router.get('/:rfqId', authenticate, rfqController.getRfqDetail);

// ===== PROTECTED ROUTES =====

// POST /api/rfqs - Create RFQ (buyer only)
router.post(
  '/',
  authenticate,
  requireAuth,
  rfqController.createRfq
);

// POST /api/rfqs/product-enquiry - Product enquiry RFQ (buyer only)
router.post(
  '/product-enquiry',
  authenticate,
  requireAuth,
  rfqController.createProductEnquiry
);

// POST /api/rfqs/enquiry - Alias for product-enquiry (backward compatibility)
router.post(
  '/enquiry',
  authenticate,
  requireAuth,
  rfqController.createProductEnquiry
);

// PATCH /api/rfqs/:rfqId - Update RFQ (buyer only)
router.patch(
  '/:rfqId',
  authenticate,
  requireAuth,
  rfqController.updateRfq
);

// DELETE /api/rfqs/:rfqId - Archive RFQ (buyer only)
router.delete(
  '/:rfqId',
  authenticate,
  requireAuth,
  rfqController.deleteRfq
);

export default router;