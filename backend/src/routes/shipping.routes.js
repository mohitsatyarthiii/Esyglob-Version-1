import { Router } from 'express';
import ShippingController from '../controllers/shipping.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import * as ShippingSetupController from '../controllers/shipping-setup.controller.js';

const router = Router();

router.post('/webhooks/:provider', ShippingController.webhook);
router.use(authenticate);
router.use(requireAuth);

router.get('/setup/me', requireRole('seller'), ShippingSetupController.mine);
router.put('/setup/me', requireRole('seller'), ShippingSetupController.updateMine);
router.post('/setup/me/sync', requireRole('seller'), ShippingSetupController.syncMine);
router.get('/setup/admin', requireRole('admin'), ShippingSetupController.adminList);
router.post('/setup/admin/:sellerId/retry', requireRole('admin'), ShippingSetupController.adminRetry);
router.patch('/setup/admin/:sellerId/:providerKey', requireRole('admin'), ShippingSetupController.adminMapping);

// GET - List shipping orders
router.get('/', ShippingController.list);

// POST - Create shipping order
router.post('/', ShippingController.create);

// GET - Single shipment detail
router.get('/:shipmentId', ShippingController.getById);

// PATCH - Book or cancel shipment
router.patch('/:shipmentId', ShippingController.performAction);

export default router;
