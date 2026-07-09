import { Router } from 'express';
import CustomsController from '../controllers/customs.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List customs clearances
router.get('/', CustomsController.list);

// POST - Create customs clearance
router.post('/', CustomsController.create);

// GET - Single clearance detail
router.get('/:clearanceId', CustomsController.getById);

// PATCH - Update clearance
router.patch('/:clearanceId', CustomsController.update);

export default router;