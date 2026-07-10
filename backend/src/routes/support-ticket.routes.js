import { Router } from 'express';
import SupportTicketController from '../controllers/support-ticket.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List support tickets
router.get('/', SupportTicketController.list);

// GET - Fetch one ticket owned by the current user
router.get('/:ticketId', SupportTicketController.getById);

// POST - Create support ticket
router.post('/', SupportTicketController.create);

export default router;
