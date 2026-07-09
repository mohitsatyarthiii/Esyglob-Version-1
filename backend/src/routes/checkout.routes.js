import { Router } from 'express';
import * as checkoutController from '../controllers/checkout.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// POST /api/checkout/quote
router.post('/quote', authenticate, requireAuth, checkoutController.getCheckoutQuote);

export default router;