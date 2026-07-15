import { Router } from 'express';
import AISearchController from '../controllers/ai-search.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';
import { requireSubscriptionFeature } from '../lib/subscription-access.js';
import { rateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

// Optional auth (sets req.user if token present)
router.use(authenticate);
router.use(requireAuth);

// Rate limit: 30 requests per minute
router.use(rateLimiter({ windowMs: 60 * 1000, max: 30, keyPrefix: 'ai-search' }));

// POST - AI search
router.post('/', requireSubscriptionFeature('aiRequests',{ai:true,aiFeature:'search'}), AISearchController.search);

export default router;
