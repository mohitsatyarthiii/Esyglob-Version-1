import { Router } from 'express';
import AISearchController from '../controllers/ai-search.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { rateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

// Optional auth (sets req.user if token present)
router.use(authenticate);

// Rate limit: 30 requests per minute
router.use(rateLimiter({ windowMs: 60 * 1000, max: 30, keyPrefix: 'ai-search' }));

// POST - AI search
router.post('/', AISearchController.search);

export default router;