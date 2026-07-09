import { Router } from 'express';
import SubscriptionController from '../controllers/subscription.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - Get subscription
router.get('/', SubscriptionController.get);

// POST - Create subscription payment order
router.post('/create-order', SubscriptionController.createOrder);

// PATCH - Toggle auto-renew
router.patch('/auto-renew', SubscriptionController.toggleAutoRenew);

export default router;