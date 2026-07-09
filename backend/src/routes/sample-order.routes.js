import { Router } from 'express';
import SampleOrderController from '../controllers/sample-order.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// Require authentication
router.use(authenticate);
router.use(requireAuth);

// POST - Create sample order (buyers only)
router.post('/', requireRole('buyer'), SampleOrderController.create);

export default router;