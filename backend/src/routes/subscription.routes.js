import { Router } from 'express';
import SubscriptionController from '../controllers/subscription.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/webhook', SubscriptionController.webhook);

router.use(authenticate);
router.use(requireAuth);

// GET - Get subscription
router.get('/', SubscriptionController.get);
router.get('/plans', SubscriptionController.plans);

// POST - Create subscription payment order
router.post('/create-order', SubscriptionController.createOrder);

// PATCH - Toggle auto-renew
router.patch('/auto-renew', SubscriptionController.toggleAutoRenew);
router.get('/admin/plans', requireRole('admin'), SubscriptionController.adminPlans);
router.put('/admin/plans/:key', requireRole('admin'), SubscriptionController.saveAdminPlan);
router.get('/admin/subscriptions', requireRole('admin'), SubscriptionController.adminSubscriptions);

export default router;
