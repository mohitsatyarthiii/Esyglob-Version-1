import { Router } from 'express';
import ShipmentController from '../controllers/shipment.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List shipments
router.get('/', ShipmentController.list);

// POST - Create shipment
router.post('/', ShipmentController.create);

export default router;