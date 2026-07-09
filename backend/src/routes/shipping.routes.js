import { Router } from 'express';
import ShippingController from '../controllers/shipping.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List shipping orders
router.get('/', ShippingController.list);

// POST - Create shipping order
router.post('/', ShippingController.create);

// GET - Single shipment detail
router.get('/:shipmentId', ShippingController.getById);

// PATCH - Book or cancel shipment
router.patch('/:shipmentId', ShippingController.performAction);

export default router;