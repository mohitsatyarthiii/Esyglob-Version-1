import { Router } from 'express';
import EscrowController from '../controllers/escrow.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List escrow transactions
router.get('/', EscrowController.list);

// POST - Create escrow agreement
router.post('/', EscrowController.create);

// GET - Single escrow detail
router.get('/:transactionId', EscrowController.getById);

// PATCH - Update escrow (deposit/approve/dispute)
router.patch('/:transactionId', EscrowController.update);

export default router;