import { Router } from 'express';
import LocationController from '../controllers/location.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

router.get('/autocomplete/capabilities', LocationController.autocompleteCapabilities);
router.get('/autocomplete/search', LocationController.autocomplete);
router.get('/autocomplete/resolve', LocationController.resolveAddress);
router.get('/autocomplete/reverse', LocationController.reverseAddress);

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
