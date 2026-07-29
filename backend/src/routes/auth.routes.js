import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validation.middleware.js';
import { rateLimiter } from '../middlewares/rate-limit.middleware.js';
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema, verifyPasswordResetOtpSchema } from '../validators/auth.validator.js';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), authController.login);

// POST /api/auth/signin
router.post('/signin', validate(loginSchema), authController.login);

// POST /api/auth/signup
router.post('/signup', validate(signupSchema), authController.signup);

router.post('/forgot-password', rateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'forgot-password' }), validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/forgot-password/resend', rateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'forgot-password-resend' }), validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/forgot-password/verify', rateLimiter({ windowMs: 10 * 60 * 1000, max: 10, keyPrefix: 'forgot-password-verify' }), validate(verifyPasswordResetOtpSchema), authController.verifyPasswordResetOtp);
router.post('/reset-password', rateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'reset-password' }), validate(resetPasswordSchema), authController.resetPassword);

// POST /api/auth/logout
router.post('/logout', authController.logout);

// POST /api/auth/refresh
router.post('/refresh', authController.refresh);

// GET /api/auth/me
router.get('/me', authController.getMe);

export default router;
