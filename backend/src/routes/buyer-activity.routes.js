import { Router } from 'express';
import BuyerActivityController from '../controllers/buyer-activity.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);
router.use(requireRole('buyer'));

// ==================== RECENTLY VIEWED ====================

// POST - Track recently viewed product
router.post('/recently-viewed', BuyerActivityController.trackRecentlyViewed);

// ==================== SAVED ITEMS ====================

// GET - Get saved items or check if item is saved
router.get('/saved', BuyerActivityController.getSavedItems);

// POST - Toggle saved item (save/unsave)
router.post('/saved', BuyerActivityController.toggleSavedItem);

export default router;