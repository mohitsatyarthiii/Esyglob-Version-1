import { Router } from 'express';
import * as contactController from '../controllers/contact.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/messenger/contacts
router.get('/', authenticate, requireAuth, contactController.getContacts);

export default router;