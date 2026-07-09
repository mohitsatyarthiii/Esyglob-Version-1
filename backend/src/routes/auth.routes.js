import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validation.middleware.js';
import { loginSchema, signupSchema } from '../validators/auth.validator.js';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(loginSchema), authController.login);

// POST /api/auth/signup
router.post('/signup', validate(signupSchema), authController.signup);

// POST /api/auth/logout
router.post('/logout', authController.logout);

// GET /api/auth/me
router.get('/me', authController.getMe);

export default router;