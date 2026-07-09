import { Router } from 'express';
import PaymentController from '../controllers/payment.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - Get payment by ID
router.get('/:paymentId', PaymentController.getById);

// POST - Initiate payment
router.post('/initiate', PaymentController.initiate);

// POST - Verify order payment
router.post('/verify/order', PaymentController.verifyOrder);

// POST - Verify subscription payment
router.post('/verify/subscription', PaymentController.verifySubscription);

export default router;