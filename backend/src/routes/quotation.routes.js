import { Router } from 'express';
import * as quotationController from '../controllers/quotation.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/quotations - List quotations
router.get('/', authenticate, requireAuth, quotationController.getQuotations);

// POST /api/quotations - Create quotation (seller only)
router.post('/', authenticate, requireAuth, quotationController.createQuotation);

// GET /api/quotations/:quotationId - Quotation detail
router.get(
  '/:quotationId',
  authenticate,
  requireAuth,
  quotationController.getQuotationDetail
);

// PATCH /api/quotations/:quotationId - Update quotation
router.patch(
  '/:quotationId',
  authenticate,
  requireAuth,
  quotationController.updateQuotation
);

// PUT /api/quotations/:quotationId - Accept/Reject quotation
router.put(
  '/:quotationId',
  authenticate,
  requireAuth,
  quotationController.respondToQuotation
);

export default router;