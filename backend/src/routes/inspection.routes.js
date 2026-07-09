import { Router } from 'express';
import InspectionController from '../controllers/inspection.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List inspections
router.get('/', InspectionController.list);

// POST - Create inspection
router.post('/', InspectionController.create);

// GET - Single inspection detail
router.get('/:inspectionId', InspectionController.getById);

// PATCH - Update inspection
router.patch('/:inspectionId', InspectionController.update);

export default router;