import { Router } from 'express';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import * as controller from '../controllers/promotion.controller.js';

const router = Router();
router.use(authenticate, requireAuth);

router.get('/coupons', requireRole('admin', 'seller'), controller.listCoupons);
router.post('/coupons', requireRole('admin', 'seller'), controller.createCoupon);
router.patch('/coupons/:couponId', requireRole('admin', 'seller'), controller.updateCoupon);
router.delete('/coupons/:couponId', requireRole('admin', 'seller'), controller.deleteCoupon);
router.get('/coupons-analytics', requireRole('admin', 'seller'), controller.couponAnalytics);

router.get('/gift-cards', controller.listGiftCards);
router.post('/gift-cards/purchase', controller.purchaseGiftCard);
router.post('/gift-cards/verify-purchase', controller.verifyGiftCardPurchase);
router.post('/gift-cards', requireRole('admin'), controller.issueGiftCard);
router.patch('/gift-cards/:giftCardId', requireRole('admin'), controller.updateGiftCard);

export default router;
