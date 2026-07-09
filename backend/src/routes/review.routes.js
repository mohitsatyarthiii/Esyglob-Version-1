import { Router } from 'express';
import ReviewController from '../controllers/review.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

// GET - List reviews (public with optional auth)
router.get('/', authenticate, ReviewController.list);

// Mutating routes require authentication
router.use(authenticate);
router.use(requireAuth);

// POST - Create review (buyers only)
router.post('/', requireRole('buyer'), ReviewController.create);

// PUT - Update review
router.put('/', ReviewController.update);

// PATCH - Seller responds to review
router.patch('/:reviewId/respond', requireRole('seller'), ReviewController.sellerRespond);

export default router;
