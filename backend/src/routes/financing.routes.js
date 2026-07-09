import { Router } from 'express';
import FinancingController from '../controllers/financing.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List financing applications
router.get('/', FinancingController.list);

// POST - Create financing application
router.post('/', FinancingController.create);

// GET - Single application detail
router.get('/:applicationId', FinancingController.getById);

// PATCH - Update application
router.patch('/:applicationId', FinancingController.update);

export default router;