import { Router } from 'express';
import WalletController from '../controllers/wallet.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - Wallet summary/dashboard
router.get('/', WalletController.getSummary);

// GET - Withdrawal history
router.get('/withdrawals', WalletController.getWithdrawals);

// POST - Create withdrawal request
router.post('/withdrawals', WalletController.createWithdrawal);

// GET - Payment methods
router.get('/payment-methods', WalletController.getPaymentMethods);

// POST - Add payment method
router.post('/payment-methods', WalletController.addPaymentMethod);

export default router;