import { Router } from 'express';
import LocationController from '../controllers/location.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// GET - Get current location
router.get('/', LocationController.getCurrent);

// PUT - Update current location (GPS tracking)
router.put('/', LocationController.update);

// PATCH - Update address from reverse geocoding
router.patch('/address', LocationController.updateAddress);

// GET - Location history
router.get('/history', LocationController.getHistory);

// PUT - Toggle tracking
router.put('/toggle', LocationController.toggleTracking);

// DELETE - Delete location data
router.delete('/', LocationController.delete);

export default router;