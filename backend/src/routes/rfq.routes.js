import { Router } from 'express';
import * as rfqController from '../controllers/rfq.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/rfqs - List RFQs (supports buyer, seller, public scopes)
router.get('/', rfqController.getRfqs);

// POST /api/rfqs - Create RFQ (buyer only)
router.post('/', authenticate, requireAuth, rfqController.createRfq);

// POST /api/rfqs/product-enquiry - Product enquiry RFQ
router.post('/product-enquiry', authenticate, requireAuth, rfqController.createProductEnquiry);

// GET /api/rfqs/:rfqId - RFQ detail
router.get('/:rfqId', rfqController.getRfqDetail);

// PATCH /api/rfqs/:rfqId - Update RFQ
router.patch('/:rfqId', authenticate, requireAuth, rfqController.updateRfq);

// DELETE /api/rfqs/:rfqId - Archive RFQ
router.delete('/:rfqId', authenticate, requireAuth, rfqController.deleteRfq);

export default router;