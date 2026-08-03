import { Router } from 'express';
import AddressController from '../controllers/address.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// GET - List all addresses
router.get('/', AddressController.list);

// POST - Create address
router.post('/', AddressController.create);

// GPS is an address selection method, not a separate location resource.
router.put('/current', AddressController.useCurrentLocation);

// PUT - Full update address
router.put('/:addressId', AddressController.update);

// PATCH - Partial update (set default)
router.patch('/:addressId', AddressController.patch);

// DELETE - Delete address
router.delete('/:addressId', AddressController.delete);

export default router;
