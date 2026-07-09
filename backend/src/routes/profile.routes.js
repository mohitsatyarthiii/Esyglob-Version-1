import { Router } from 'express';
import ProfileController from '../controllers/profile.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// GET - Get profile
router.get('/', ProfileController.get);

// PATCH - Update profile
router.patch('/', ProfileController.update);

// PATCH - Change password
router.patch('/password', ProfileController.changePassword);

export default router;