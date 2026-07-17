import { Router } from 'express';
import OrderController from '../controllers/order.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List orders
router.get('/', OrderController.list);

// POST - Create order
router.post('/', OrderController.create);

// GET - Single order
router.get('/:orderId', OrderController.getById);

router.post('/:orderId/production-updates', OrderController.addProductionUpdate);

// PATCH - Update order status
router.patch('/:orderId', OrderController.updateStatus);

export default router;
