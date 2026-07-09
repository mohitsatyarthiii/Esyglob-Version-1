import { Router } from 'express';
import DisputeController from '../controllers/dispute.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List disputes
router.get('/', DisputeController.list);

// POST - File dispute
router.post('/', DisputeController.create);

// GET - Single dispute detail
router.get('/:disputeId', DisputeController.getById);

// PATCH - Update dispute (message/status)
router.patch('/:disputeId', DisputeController.update);

export default router;