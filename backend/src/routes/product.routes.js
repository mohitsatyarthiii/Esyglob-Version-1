import { Router } from 'express';
import ProductController from '../controllers/product.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import rateLimit from 'express-rate-limit';
import { requireSubscriptionFeature } from '../lib/subscription-access.js';

const router = Router();

// Rate limiting for public routes
const publicLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 50, // 50 requests per second
  message: 'Too many requests, please try again later.',
});

// ===== PUBLIC ROUTES (authenticate sets req.user if logged in) =====

// GET /api/products - Public listing
router.get('/', publicLimiter, authenticate, ProductController.getProducts);

// GET /api/products/:productId - Product detail
router.get('/:productId', publicLimiter, authenticate, ProductController.getProductDetail);

// ===== PROTECTED ROUTES (SELLER ONLY) =====

// POST /api/products - Create product
router.post(
  '/',
  authenticate,
  requireAuth,
  requireRole('seller'),
  requireSubscriptionFeature('products',{role:'seller'}),
  ProductController.createProduct
);

// PATCH /api/products/:productId - Update product
router.patch(
  '/:productId',
  authenticate,
  requireAuth,
  requireRole('seller'),
  ProductController.updateProduct
);

// DELETE /api/products/:productId - Delete product
router.delete(
  '/:productId',
  authenticate,
  requireAuth,
  requireRole('seller'),
  ProductController.deleteProduct
);

export default router;
