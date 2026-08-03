import { Router } from 'express';
import LocationController from '../controllers/location.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);
router.get('/autocomplete/capabilities', LocationController.autocompleteCapabilities);
router.get('/autocomplete/search', LocationController.autocomplete);
router.get('/autocomplete/resolve', LocationController.resolveAddress);
router.get('/autocomplete/reverse', LocationController.reverseAddress);

export default router;
