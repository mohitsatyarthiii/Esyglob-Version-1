import { Router } from 'express';
import ContactLeadController from '../controllers/contact-lead.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { rateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

// Optional auth (sets req.user if token present, but doesn't block)
router.use(authenticate);

// Rate limit: 5 submissions per 10 minutes per IP
router.use(rateLimiter({ windowMs: 10 * 60 * 1000, max: 5, keyPrefix: 'contact-lead' }));

// POST - Submit contact form (public)
router.post('/', ContactLeadController.submit);

export default router;