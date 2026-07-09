import { Router } from 'express';
import WarehouseController from '../controllers/warehouse.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - Get warehousing data
router.get('/', WarehouseController.getData);

// POST - Process warehouse operation
router.post('/', WarehouseController.processOperation);

export default router;