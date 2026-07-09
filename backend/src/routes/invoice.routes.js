import { Router } from 'express';
import InvoiceController from '../controllers/invoice.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List invoices
router.get('/', InvoiceController.list);

export default router;